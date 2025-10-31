const TAB_STATES = {
    UNSUSPENDED: 'unsuspended',
    SUSPENDED: 'suspended',
    LOADING: 'loading',
  };
  
  const YT_WATCH_REGEX = /^https?:\/\/(www\.)?youtube\.com\/watch\?/i;
  
  let youtubeWatchTabsInfosOfCurrentWindow = {}; // { [tabId]: TabInfo }
  let youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime = [];
  let tabsInCurrentWindowAreKnownToBeSorted = false;
  
  const now = () => Date.now();
  const isWatch = (url) => typeof url === 'string' && YT_WATCH_REGEX.test(url);
  
  function safeGet(obj, path, fallback = undefined) {
    try {
      return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj) ?? fallback;
    } catch (_) { return fallback; }
  }
  
  function getCurrentWindowTabs() {
    return new Promise((resolve) => chrome.tabs.query({ currentWindow: true }, (tabs) => resolve(tabs || [])));
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
  function setUnsuspendTimestamp(info, prevStatus, nextStatus) {
    if ((prevStatus === TAB_STATES.SUSPENDED || prevStatus === TAB_STATES.LOADING) &&
        nextStatus === TAB_STATES.UNSUSPENDED) {
      info.unsuspendedTimestamp = now();
    }
  }
  
  async function updateYoutubeWatchTabsInfos() {
    const tabs = await getCurrentWindowTabs();
    const visibleIds = new Set();
  
    for (const tab of tabs) {
      if (!isWatch(tab.url)) continue;
      visibleIds.add(tab.id);
  
      const prev = youtubeWatchTabsInfosOfCurrentWindow[tab.id] || {};
      const nextStatus = statusFromTab(tab);
  
      const prevContentReady = Boolean(prev.contentScriptReady);
      const base = youtubeWatchTabsInfosOfCurrentWindow[tab.id] = {
        id: tab.id,
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
  
    for (const id of Object.keys(youtubeWatchTabsInfosOfCurrentWindow)) {
      if (!visibleIds.has(Number(id))) delete youtubeWatchTabsInfosOfCurrentWindow[id];
    }
  
    computeSorting();
  }
  
  function computeSorting() {
  const entries = Object.values(youtubeWatchTabsInfosOfCurrentWindow);

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
  youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime = expectedOrder;

  const allHaveFiniteRemainingTimes = unknown.length === 0;

  const alreadyInExpectedOrder =
    currentOrder.length > 0 &&
    currentOrder.length === expectedOrder.length &&
    currentOrder.every((id, i) => id === expectedOrder[i]);

  tabsInCurrentWindowAreKnownToBeSorted = allHaveFiniteRemainingTimes && alreadyInExpectedOrder;
}
  
  async function refreshMetricsForTab(tabId) {
    try {
      const info = youtubeWatchTabsInfosOfCurrentWindow[tabId];
      if (!info) return;

      // only poll active, unsuspended tabs
      if (info.status !== TAB_STATES.UNSUSPENDED) return;

      const tab = await getTab(tabId);
      if (!isWatch(tab.url)) return;
  
      const result = await sendMessageToTab(tabId, { message: 'getVideoMetrics' });
      if (!result || result.ok !== true) {
        info.contentScriptReady = false;
        return;
      }

      const resp = result.data;
      if (!resp || typeof resp !== 'object') return;
      info.contentScriptReady = true;

      if (resp.title || resp.url) {
        info.videoDetails = info.videoDetails || {};
        if (resp.title) info.videoDetails.title = resp.title;
        if (!info.url && resp.url) info.url = resp.url;
      }
  
      if (resp.isLive === true) info.isLiveStream = true;
  
      const len = Number(resp.lengthSeconds ?? resp.duration ?? NaN);
      const cur = Number(resp.currentTime ?? NaN);
      const rate = Number(resp.playbackRate ?? 1);
  
      if (isFinite(len)) {
        info.videoDetails = info.videoDetails || {};
        info.videoDetails.lengthSeconds = len;
      }
      if (isFinite(len) && isFinite(cur)) {
        const rem = Math.max(0, (len - cur) / (isFinite(rate) && rate > 0 ? rate : 1));
        info.videoDetails.remainingTime = rem;
      } else if (isFinite(len) && info.videoDetails && info.videoDetails.remainingTime == null) {
        info.videoDetails.remainingTime = len;
      }
  
      computeSorting();
    } catch (_) {
      // ignore; will retry later
    }
  }
  
  async function sortTabsInCurrentWindow() {
    const ids = youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime.slice();
    const finiteIds = ids.filter(id => {
      const rt = safeGet(youtubeWatchTabsInfosOfCurrentWindow[id], 'videoDetails.remainingTime', null);
      return typeof rt === 'number';
    });
    if (finiteIds.length === 0) return;
  
    const tabs = await getCurrentWindowTabs();
    const positions = tabs.filter(t => isWatch(t.url)).map(t => t.index).sort((a,b)=>a-b);
    if (!positions.length) return;
  
    let cursor = positions[0];
    for (const id of finiteIds) {
      try { await chrome.tabs.move(id, { index: cursor++ }); } catch (_) {}
    }
    await updateYoutubeWatchTabsInfos();
  }
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message.action || message.message;
  
    const respondAsync = (fn) => {
      Promise.resolve(fn()).then((res) => { if (res !== undefined) sendResponse(res); });
      return true;
    };
  
    const handlers = {
      updateYoutubeWatchTabsInfos: async () => { await updateYoutubeWatchTabsInfos(); },
      sendTabsInfos: async () => {
        await updateYoutubeWatchTabsInfos();
        const ids = Object.keys(youtubeWatchTabsInfosOfCurrentWindow).map(Number);
        await Promise.all(ids.map(refreshMetricsForTab));
        return {
          youtubeWatchTabsInfosOfCurrentWindow,
          youtubeWatchTabsInfosOfCurrentWindowIDsSortedByRemainingTime,
        };
      },
      areTabsInCurrentWindowKnownToBeSorted: async () => {
        await updateYoutubeWatchTabsInfos();
        return tabsInCurrentWindowAreKnownToBeSorted;
      },
      sortTabs: async () => { await sortTabsInCurrentWindow(); },
      activateTab: async () => {
        const tabId = message.tabId;
        if (tabId) { try { await chrome.tabs.update(tabId, { active: true }); } catch (_) {} }
      },
      reloadTab: async () => {
        const tabId = message.tabId;
        if (tabId) {
          try { await chrome.tabs.reload(tabId); } catch (_) {}
          const info = youtubeWatchTabsInfosOfCurrentWindow[tabId];
          if (info) {
            info.status = TAB_STATES.LOADING;
            info.unsuspendedTimestamp = now();
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
        if (!tabId) return;
        const info = youtubeWatchTabsInfosOfCurrentWindow[tabId] || (youtubeWatchTabsInfosOfCurrentWindow[tabId] = {});
        info.contentScriptReady = true;
        refreshMetricsForTab(tabId);
        sendResponse({ message: 'contentScriptAck' });
      },
      metadataLoaded: async () => {
        const tabId = sender?.tab?.id;
        if (!tabId) return;
        const info = youtubeWatchTabsInfosOfCurrentWindow[tabId];
        if (info) info.metadataLoaded = true;
        await refreshMetricsForTab(tabId);
      },
      lightweightDetails: async () => {
        const tabId = sender?.tab?.id;
        const d = message.details || {};
        if (!tabId) return;
  
        const info = youtubeWatchTabsInfosOfCurrentWindow[tabId] ||
                     (youtubeWatchTabsInfosOfCurrentWindow[tabId] = { id: tabId, url: d.url || sender?.tab?.url });
  
        if (d.url) info.url = d.url;
        info.videoDetails = info.videoDetails || {};
        if (d.title) info.videoDetails.title = d.title;
        if (typeof d.lengthSeconds === 'number' && isFinite(d.lengthSeconds)) {
          info.videoDetails.lengthSeconds = d.lengthSeconds;
          if (info.videoDetails.remainingTime == null) info.videoDetails.remainingTime = d.lengthSeconds;
        }
        if (d.isLive) info.isLiveStream = true;
        computeSorting();
      },
    };
  
    if (handlers[type]) return respondAsync(handlers[type]);
    return false;
  });
  
  // ----- Tab lifecycle
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!isWatch(tab.url)) return;
    if (Object.prototype.hasOwnProperty.call(changeInfo, 'discarded') ||
        changeInfo.status === 'complete' || changeInfo.status === 'loading' || changeInfo.url) {
      await updateYoutubeWatchTabsInfos();
      refreshMetricsForTab(tabId);
    }
  });
  
  chrome.tabs.onRemoved.addListener((tabId) => {
    delete youtubeWatchTabsInfosOfCurrentWindow[tabId];
    computeSorting();
  });
  
  if (chrome.webNavigation && chrome.webNavigation.onHistoryStateUpdated) {
    chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
      if (details.frameId !== 0) return;
      if (!isWatch(details.url)) return;
      await updateYoutubeWatchTabsInfos();
      refreshMetricsForTab(details.tabId);
    }, { url: [{ hostContains: 'youtube.com' }] });
  } else {
    console.warn('[TabSort] webNavigation API unavailable (missing permission?); falling back to tabs.onUpdated only.');
  }
  
  chrome.alarms.create('refreshRemaining', { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'refreshRemaining') return;
    const ids = Object.keys(youtubeWatchTabsInfosOfCurrentWindow).map(Number);
    await Promise.all(ids.map(refreshMetricsForTab));
  });
