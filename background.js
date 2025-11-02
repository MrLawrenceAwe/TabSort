const TAB_STATES = {
    UNSUSPENDED: 'unsuspended',
    SUSPENDED: 'suspended',
    LOADING: 'loading',
  };
  
  const YT_WATCH_REGEX = /^https?:\/\/(www\.)?youtube\.com\/watch\?/i;
  
  let youtubeWatchTabRecordsOfCurrentWindow = {}; // { [tabId]: TabRecord }
  let youtubeWatchTabRecordIdsSortedByRemainingTime = [];
  let tabsInCurrentWindowAreKnownToBeSorted = false;
  let trackedWindowId = null;
  
  const now = () => Date.now();
  const isWatch = (url) => typeof url === 'string' && YT_WATCH_REGEX.test(url);
  
  function safeGet(obj, path, fallback = undefined) {
    try {
      return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj) ?? fallback;
    } catch (_) { return fallback; }
  }
  
  function resolveTrackedWindowId(windowId) {
    if (typeof windowId === 'number' && Number.isFinite(windowId)) {
      trackedWindowId = windowId;
    }
    return (typeof trackedWindowId === 'number' && Number.isFinite(trackedWindowId))
      ? trackedWindowId
      : null;
  }
  
  function queryTabs(query) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.query(query, (tabs) => {
          const err = chrome.runtime.lastError;
          if (err) {
            resolve([]);
            return;
          }
          resolve(Array.isArray(tabs) ? tabs : []);
        });
      } catch (_) {
        resolve([]);
      }
    });
  }
  
  async function getTabsForTrackedWindow(windowId) {
    const targetWindowId = resolveTrackedWindowId(windowId);
    const baseQuery = (targetWindowId != null) ? { windowId: targetWindowId } : { currentWindow: true };
    const [visibleTabs, hiddenTabs] = await Promise.all([
      queryTabs(baseQuery),
      queryTabs({ ...baseQuery, hidden: true }),
    ]);
  
    const deduped = [];
    const seen = new Set();
    for (const tab of [...visibleTabs, ...hiddenTabs]) {
      if (!tab || typeof tab.id !== 'number') continue;
      if (seen.has(tab.id)) continue;
      seen.add(tab.id);
      deduped.push(tab);
    }
  
    return { tabs: deduped, windowId: targetWindowId };
  }
  function getTab(tabId) {
    return new Promise((resolve, reject) => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        resolve(tab);
      });
    });
  }
  function sendMessageToTab(tabId, payload) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, payload, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.debug(`[TabSort] skipped message to tab ${tabId}: ${err.message}`);
          resolve({ ok: false, error: err });
          return;
        }
        resolve({ ok: true, data: resp });
      });
    });
  }
  
  function statusFromTab(tab) {
    if (tab.discarded) return TAB_STATES.SUSPENDED;
    if (tab.status === 'loading') return TAB_STATES.LOADING;
    return TAB_STATES.UNSUSPENDED;
  }
  function setUnsuspendTimestamp(record, prevStatus, nextStatus) {
    if ((prevStatus === TAB_STATES.SUSPENDED || prevStatus === TAB_STATES.LOADING) &&
        nextStatus === TAB_STATES.UNSUSPENDED) {
      record.unsuspendedTimestamp = now();
    }
  }
  
  async function updateYoutubeWatchTabRecords(windowId) {
    const { tabs, windowId: targetWindowId } = await getTabsForTrackedWindow(windowId);
    if (targetWindowId == null && tabs.length === 0) return;
    const visibleIds = new Set();
  
    for (const tab of tabs) {
      if (!isWatch(tab.url)) continue;
      visibleIds.add(tab.id);
  
      const prev = youtubeWatchTabRecordsOfCurrentWindow[tab.id] || {};
      const nextStatus = statusFromTab(tab);
  
      const prevContentReady = Boolean(prev.contentScriptReady);
      const base = youtubeWatchTabRecordsOfCurrentWindow[tab.id] = {
        id: tab.id,
        windowId: tab.windowId,
        url: tab.url,
        index: tab.index,
        status: nextStatus,
        contentScriptReady: nextStatus === TAB_STATES.UNSUSPENDED ? prevContentReady : false,
        metadataLoaded: Boolean(prev.metadataLoaded),
        isLiveStream: Boolean(prev.isLiveStream),
        videoDetails: prev.videoDetails || null, // { title, lengthSeconds, remainingTime }
        unsuspendedTimestamp: prev.unsuspendedTimestamp || null,
      };
  
      setUnsuspendTimestamp(base, prev.status, nextStatus);
    }
  
    for (const id of Object.keys(youtubeWatchTabRecordsOfCurrentWindow)) {
      if (!visibleIds.has(Number(id))) delete youtubeWatchTabRecordsOfCurrentWindow[id];
    }
  
    computeSorting();
  }
  
  function computeSorting() {
    const entries = Object.values(youtubeWatchTabRecordsOfCurrentWindow);

    const currentOrder = entries
      .slice()
      .sort((a, b) => a.index - b.index)
      .map(t => t.id);

    const enriched = entries.map(t => {
      const rt = t?.videoDetails?.remainingTime;
      const val = (typeof rt === 'number' && isFinite(rt)) ? rt : null;
      return { id: t.id, index: t.index, remainingTime: val };
    });

    const finite = enriched.filter(e => e.remainingTime !== null);
    const unknown = enriched.filter(e => e.remainingTime === null);

    const finiteSortedIds = finite
      .slice()
      .sort((a, b) => a.remainingTime - b.remainingTime)
      .map(e => e.id);

    const unknownIdsInCurrentOrder = currentOrder.filter(id => unknown.some(u => u.id === id));

    const expectedOrder = [...finiteSortedIds, ...unknownIdsInCurrentOrder];
    youtubeWatchTabRecordIdsSortedByRemainingTime = expectedOrder;

    const allHaveFiniteRemainingTimes = unknown.length === 0;

    const alreadyInExpectedOrder =
      currentOrder.length > 0 &&
      currentOrder.length === expectedOrder.length &&
      currentOrder.every((id, i) => id === expectedOrder[i]);

    tabsInCurrentWindowAreKnownToBeSorted = allHaveFiniteRemainingTimes && alreadyInExpectedOrder;
  }
  
  async function refreshMetricsForTab(tabId) {
    try {
      const record = youtubeWatchTabRecordsOfCurrentWindow[tabId];
      if (!record) return;

      // only poll active, unsuspended tabs
      if (record.status !== TAB_STATES.UNSUSPENDED) return;

      const tab = await getTab(tabId);
      if (trackedWindowId != null && tab.windowId !== trackedWindowId) return;
      if (tab.windowId != null) {
        record.windowId = tab.windowId;
        resolveTrackedWindowId(tab.windowId);
      }
      if (!isWatch(tab.url)) return;
  
      const result = await sendMessageToTab(tabId, { message: 'getVideoMetrics' });
      if (!result || result.ok !== true) {
        record.contentScriptReady = false;
        if (record.videoDetails && record.videoDetails.remainingTime != null) {
          record.videoDetails.remainingTime = null;
        }
        computeSorting();
        return;
      }

      const resp = result.data;
      if (!resp || typeof resp !== 'object') return;
      record.contentScriptReady = true;

      if (resp.title || resp.url) {
        record.videoDetails = record.videoDetails || {};
        if (resp.title) record.videoDetails.title = resp.title;
        if (!record.url && resp.url) record.url = resp.url;
      }
  
      if (resp.isLive === true) record.isLiveStream = true;
  
      const len = Number(resp.lengthSeconds ?? resp.duration ?? NaN);
      const cur = Number(resp.currentTime ?? NaN);
      const rate = Number(resp.playbackRate ?? 1);
  
      if (isFinite(len)) {
        record.videoDetails = record.videoDetails || {};
        record.videoDetails.lengthSeconds = len;
      }
      if (isFinite(len) && isFinite(cur)) {
        const rem = Math.max(0, (len - cur) / (isFinite(rate) && rate > 0 ? rate : 1));
        record.videoDetails.remainingTime = rem;
      } else if (isFinite(len) && record.videoDetails && record.videoDetails.remainingTime == null) {
        record.videoDetails.remainingTime = len;
      }
  
      computeSorting();
    } catch (_) {
      // ignore; will retry later
    }
  }
  
  async function sortTabsInCurrentWindow() {
    const ids = youtubeWatchTabRecordIdsSortedByRemainingTime.slice();
    const finiteIds = ids.filter(id => {
      const rt = safeGet(youtubeWatchTabRecordsOfCurrentWindow[id], 'videoDetails.remainingTime', null);
      return typeof rt === 'number';
    });
    if (finiteIds.length === 0) return;
  
    const { tabs } = await getTabsForTrackedWindow();
    const positions = tabs.filter(t => isWatch(t.url)).map(t => t.index).sort((a,b)=>a-b);
    if (!positions.length) return;
  
    let cursor = positions[0];
    for (const id of finiteIds) {
      try { await chrome.tabs.move(id, { index: cursor++ }); } catch (_) {}
    }
    await updateYoutubeWatchTabRecords(trackedWindowId);
  }
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message.action || message.message;
  
    const respondAsync = (fn) => {
      Promise.resolve(fn()).then((res) => { if (res !== undefined) sendResponse(res); });
      return true;
    };
  
    const handlers = {
      updateYoutubeWatchTabRecords: async () => { await updateYoutubeWatchTabRecords(message.windowId); },
      sendTabRecords: async () => {
        await updateYoutubeWatchTabRecords(message.windowId);
        const ids = Object.keys(youtubeWatchTabRecordsOfCurrentWindow).map(Number);
        await Promise.all(ids.map(refreshMetricsForTab));
        return {
          youtubeWatchTabRecordsOfCurrentWindow,
          youtubeWatchTabRecordIdsSortedByRemainingTime,
        };
      },
      areTabsInCurrentWindowKnownToBeSorted: async () => {
        await updateYoutubeWatchTabRecords(message.windowId);
        return tabsInCurrentWindowAreKnownToBeSorted;
      },
      sortTabs: async () => {
        resolveTrackedWindowId(message.windowId);
        await sortTabsInCurrentWindow();
      },
      activateTab: async () => {
        const tabId = message.tabId;
        if (typeof message.windowId === 'number') resolveTrackedWindowId(message.windowId);
        if (tabId) { try { await chrome.tabs.update(tabId, { active: true }); } catch (_) {} }
      },
      reloadTab: async () => {
        const tabId = message.tabId;
        if (tabId) {
          if (typeof message.windowId === 'number') resolveTrackedWindowId(message.windowId);
          try { await chrome.tabs.reload(tabId); } catch (_) {}
          const record = youtubeWatchTabRecordsOfCurrentWindow[tabId];
          if (record) {
            record.status = TAB_STATES.LOADING;
            record.unsuspendedTimestamp = now();
          }
        }
      },
      logPopupMessage: async () => {
        const level = message.type === 'error' ? 'error' : 'log';
        console[level](`[Popup] ${message.info}`);
      },
  
      // content -> background
      contentScriptReady: async () => {
        const tabId = sender?.tab?.id;
        resolveTrackedWindowId(sender?.tab?.windowId);
        if (!tabId) return;
        const record = youtubeWatchTabRecordsOfCurrentWindow[tabId] || (youtubeWatchTabRecordsOfCurrentWindow[tabId] = { windowId: sender?.tab?.windowId ?? null });
        if (sender?.tab?.windowId != null) record.windowId = sender.tab.windowId;
        record.contentScriptReady = true;
        refreshMetricsForTab(tabId);
        sendResponse({ message: 'contentScriptAck' });
      },
      metadataLoaded: async () => {
        const tabId = sender?.tab?.id;
        resolveTrackedWindowId(sender?.tab?.windowId);
        if (!tabId) return;
        const record = youtubeWatchTabRecordsOfCurrentWindow[tabId];
        if (record) record.metadataLoaded = true;
        await refreshMetricsForTab(tabId);
      },
      lightweightDetails: async () => {
        const tabId = sender?.tab?.id;
        const d = message.details || {};
        resolveTrackedWindowId(sender?.tab?.windowId);
        if (!tabId) return;
  
        const record = youtubeWatchTabRecordsOfCurrentWindow[tabId] ||
                     (youtubeWatchTabRecordsOfCurrentWindow[tabId] = { id: tabId, url: d.url || sender?.tab?.url, windowId: sender?.tab?.windowId ?? null });
 
        if (sender?.tab?.windowId != null) record.windowId = sender.tab.windowId;
        if (d.url) record.url = d.url;
        record.videoDetails = record.videoDetails || {};
        if (d.title) record.videoDetails.title = d.title;
        if (typeof d.lengthSeconds === 'number' && isFinite(d.lengthSeconds)) {
          record.videoDetails.lengthSeconds = d.lengthSeconds;
          if (record.videoDetails.remainingTime == null) record.videoDetails.remainingTime = d.lengthSeconds;
        }
        if (d.isLive) record.isLiveStream = true;
        computeSorting();
      },
    };
  
    if (handlers[type]) return respondAsync(handlers[type]);
    return false;
  });
  
  // ----- Tab lifecycle
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!isWatch(tab.url)) return;
    if (trackedWindowId != null && tab.windowId !== trackedWindowId) return;
    if (Object.prototype.hasOwnProperty.call(changeInfo, 'discarded') ||
        changeInfo.status === 'complete' || changeInfo.status === 'loading' || changeInfo.url) {
      await updateYoutubeWatchTabRecords(tab.windowId);
      refreshMetricsForTab(tabId);
    }
  });
  
  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (trackedWindowId != null && removeInfo && removeInfo.windowId !== trackedWindowId) return;
    delete youtubeWatchTabRecordsOfCurrentWindow[tabId];
    computeSorting();
  });
  
  if (chrome.webNavigation && chrome.webNavigation.onHistoryStateUpdated) {
    chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
      if (details.frameId !== 0) return;
      if (!isWatch(details.url)) return;

      let windowIdForUpdate = null;
      if (typeof details.tabId === 'number') {
        try {
          const tab = await getTab(details.tabId);
          if (trackedWindowId != null && tab.windowId !== trackedWindowId) return;
          windowIdForUpdate = tab.windowId;
        } catch (_) {
          return;
        }
      } else if (trackedWindowId != null) {
        windowIdForUpdate = trackedWindowId;
      }
      await updateYoutubeWatchTabRecords(windowIdForUpdate);
      refreshMetricsForTab(details.tabId);
    }, { url: [{ hostContains: 'youtube.com' }] });
  } else {
    console.warn('[TabSort] webNavigation API unavailable (missing permission?); falling back to tabs.onUpdated only.');
  }
  
  chrome.alarms.create('refreshRemaining', { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'refreshRemaining') return;
    const ids = Object.keys(youtubeWatchTabRecordsOfCurrentWindow).map(Number);
    await Promise.all(ids.map(refreshMetricsForTab));
  });
