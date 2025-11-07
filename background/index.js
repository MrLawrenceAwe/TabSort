import { TAB_STATES } from '../shared/constants.js';
import {
  broadcastTabSnapshot,
  buildTabSnapshot,
  recomputeSorting,
  refreshMetricsForTab,
  sortTabsInCurrentWindow,
  updateYoutubeWatchTabRecords,
} from './records.js';
import { backgroundState, now, resolveTrackedWindowId } from './state.js';
import { isWatch } from './helpers.js';
import { getTab } from './tab-service.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.action || message?.message;

  const respondAsync = (fn, label) => {
    Promise.resolve()
      .then(() => fn())
      .then((res) => {
        if (res !== undefined) sendResponse(res);
      })
      .catch((error) => {
        const messageText = error instanceof Error ? error.message : String(error);
        console.error(`[TabSort] handler "${label}" failed: ${messageText}`);
        sendResponse({ error: messageText });
      });
    return true;
  };

  const handlers = {
    updateYoutubeWatchTabRecords: async () => {
      await updateYoutubeWatchTabRecords(message.windowId);
    },
    sendTabRecords: async () => {
      await updateYoutubeWatchTabRecords(message.windowId);
      const ids = Object.keys(backgroundState.youtubeWatchTabRecordsOfCurrentWindow).map(Number);
      await Promise.all(ids.map(refreshMetricsForTab));
      return buildTabSnapshot();
    },
    areTabsInCurrentWindowKnownToBeSorted: async () => {
      await updateYoutubeWatchTabRecords(message.windowId);
      return backgroundState.tabsInCurrentWindowAreKnownToBeSorted;
    },
    sortTabs: async () => {
      resolveTrackedWindowId(message.windowId);
      await sortTabsInCurrentWindow();
      await updateYoutubeWatchTabRecords(backgroundState.trackedWindowId);
    },
    activateTab: async () => {
      const tabId = message.tabId;
      if (!tabId) return;
      if (typeof message.windowId === 'number') resolveTrackedWindowId(message.windowId);
      try {
        await chrome.tabs.update(tabId, { active: true });
      } catch (_) {
        // ignore activation failure
      }
    },
    reloadTab: async () => {
      const tabId = message.tabId;
      if (!tabId) return;
      if (typeof message.windowId === 'number') resolveTrackedWindowId(message.windowId);
      try {
        await chrome.tabs.reload(tabId);
      } catch (_) {
        // ignore reload failure
      }
      const record = backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId];
      if (record) {
        record.status = TAB_STATES.LOADING;
        record.unsuspendedTimestamp = now();
        broadcastTabSnapshot();
      }
    },
    logPopupMessage: async () => {
      const level = message.type === 'error' ? 'error' : 'log';
      console[level](`[Popup] ${message.info}`);
    },
    contentScriptReady: async () => {
      const tabId = sender?.tab?.id;
      resolveTrackedWindowId(sender?.tab?.windowId);
      if (!tabId) return;
      const record =
        backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId] ||
        (backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId] = {
          id: tabId,
          windowId: sender?.tab?.windowId ?? null,
        });
      if (sender?.tab?.windowId != null) record.windowId = sender.tab.windowId;
      record.contentScriptReady = true;
      broadcastTabSnapshot();
      await refreshMetricsForTab(tabId);
      return { message: 'contentScriptAck' };
    },
    metadataLoaded: async () => {
      const tabId = sender?.tab?.id;
      resolveTrackedWindowId(sender?.tab?.windowId);
      if (!tabId) return;
      const record = backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId];
      if (record) record.metadataLoaded = true;
      broadcastTabSnapshot();
      await refreshMetricsForTab(tabId);
    },
    lightweightDetails: async () => {
      const tabId = sender?.tab?.id;
      const details = message.details || {};
      resolveTrackedWindowId(sender?.tab?.windowId);
      if (!tabId) return;
      const record =
        backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId] ||
        (backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId] = {
          id: tabId,
          url: details.url || sender?.tab?.url,
          windowId: sender?.tab?.windowId ?? null,
        });
      if (sender?.tab?.windowId != null) record.windowId = sender.tab.windowId;
      if (details.url) record.url = details.url;
      record.videoDetails = record.videoDetails || {};
      if (details.title) record.videoDetails.title = details.title;
      if (typeof details.lengthSeconds === 'number' && isFinite(details.lengthSeconds)) {
        record.videoDetails.lengthSeconds = details.lengthSeconds;
        if (record.videoDetails.remainingTime == null) {
          record.videoDetails.remainingTime = details.lengthSeconds;
        }
      }
      if (details.isLive) record.isLiveStream = true;
      recomputeSorting();
    },
  };

  if (handlers[type]) {
    return respondAsync(handlers[type], type);
  }
  return false;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!isWatch(tab.url)) return;
  if (backgroundState.trackedWindowId != null && tab.windowId !== backgroundState.trackedWindowId) return;
  if (
    Object.prototype.hasOwnProperty.call(changeInfo, 'discarded') ||
    changeInfo.status === 'complete' ||
    changeInfo.status === 'loading' ||
    changeInfo.url
  ) {
    await updateYoutubeWatchTabRecords(tab.windowId);
    refreshMetricsForTab(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (backgroundState.trackedWindowId != null && removeInfo?.windowId !== backgroundState.trackedWindowId) return;
  delete backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId];
  recomputeSorting();
});

if (chrome.webNavigation?.onHistoryStateUpdated) {
  chrome.webNavigation.onHistoryStateUpdated.addListener(
    async (details) => {
      if (details.frameId !== 0) return;
      if (!isWatch(details.url)) return;

      let windowIdForUpdate = null;
      if (typeof details.tabId === 'number') {
        try {
          const tab = await getTab(details.tabId);
          if (backgroundState.trackedWindowId != null && tab.windowId !== backgroundState.trackedWindowId) return;
          windowIdForUpdate = tab.windowId;
        } catch (_) {
          return;
        }
      } else if (backgroundState.trackedWindowId != null) {
        windowIdForUpdate = backgroundState.trackedWindowId;
      }
      await updateYoutubeWatchTabRecords(windowIdForUpdate);
      refreshMetricsForTab(details.tabId);
    },
    { url: [{ hostContains: 'youtube.com' }] },
  );
} else {
  console.warn(
    '[TabSort] webNavigation API unavailable (missing permission?); falling back to tabs.onUpdated only.',
  );
}

chrome.alarms.create('refreshRemaining', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'refreshRemaining') return;
  const ids = Object.keys(backgroundState.youtubeWatchTabRecordsOfCurrentWindow).map(Number);
  await Promise.all(ids.map(refreshMetricsForTab));
});
