
import { REFRESH_INTERVAL_MINUTES, REFRESH_ALARM_NAME } from '../shared/constants.js';
import {
  broadcastTabSnapshot,
  recomputeSorting,
  refreshMetricsForTab,
  updateYoutubeWatchTabRecords,
} from './records.js';
import { backgroundState, resolveTrackedWindowId } from './state.js';
import { isWatch } from './helpers.js';
import { getTab } from './tab-service.js';
import {
  activateTab,
  reloadTab,
  handleUpdateYoutubeWatchTabRecords,
  handleSendTabRecords,
  handleAreTabsInCurrentWindowKnownToBeSorted,
  handleSortTabs,
  handleContentScriptReady,
  handleMetadataLoaded,
  handleLightweightDetails,
} from './handlers/index.js';
import { createAsyncResponder } from './async-responder.js';

function resetTrackedWindow() {
  resolveTrackedWindowId(null, { force: true });
  backgroundState.youtubeWatchTabRecordsOfCurrentWindow = {};
  backgroundState.lastBroadcastSignature = null;
  recomputeSorting();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.action || message?.message;
  const respondAsync = createAsyncResponder(sendResponse);

  const handlers = {
    updateYoutubeWatchTabRecords: () => handleUpdateYoutubeWatchTabRecords(message),
    sendTabRecords: () => handleSendTabRecords(message),
    areTabsInCurrentWindowKnownToBeSorted: () => handleAreTabsInCurrentWindowKnownToBeSorted(message),
    sortTabs: () => handleSortTabs(message),
    ping: async () => ({ ok: true }),
    activateTab: () => activateTab(message),
    reloadTab: () => reloadTab(message),
    logPopupMessage: async () => {
      const level = message.type === 'error' ? 'error' : 'log';
      console[level](`[Popup] ${message.info}`);
    },
    contentScriptReady: () => handleContentScriptReady(message, sender),
    metadataLoaded: () => handleMetadataLoaded(message, sender),
    lightweightDetails: () => handleLightweightDetails(message, sender),
  };

  if (handlers[type]) {
    return respondAsync(handlers[type], type);
  }
  return false;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab) return;
  if (backgroundState.trackedWindowId != null && tab.windowId !== backgroundState.trackedWindowId) return;
  if (
    Object.prototype.hasOwnProperty.call(changeInfo, 'discarded') ||
    changeInfo.status === 'complete' ||
    changeInfo.status === 'loading' ||
    changeInfo.url
  ) {
    await updateYoutubeWatchTabRecords(tab.windowId);
    if (isWatch(tab.url)) {
      await refreshMetricsForTab(tabId);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (backgroundState.trackedWindowId != null && removeInfo?.windowId !== backgroundState.trackedWindowId) return;
  delete backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId];
  if (removeInfo?.isWindowClosing && removeInfo.windowId === backgroundState.trackedWindowId) {
    resetTrackedWindow();
    return;
  }
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
      await refreshMetricsForTab(details.tabId);
    },
    { url: [{ hostContains: 'youtube.com' }] },
  );
} else {
  console.warn(
    '[TabSort] webNavigation API unavailable (missing permission?); falling back to tabs.onUpdated only.',
  );
}


function ensureRefreshAlarm() {
  try {
    chrome.alarms.get(REFRESH_ALARM_NAME, (alarm) => {
      if (chrome.runtime.lastError) {
        console.debug(`[TabSort] alarm get failed: ${chrome.runtime.lastError.message}`);
        return;
      }
      if (!alarm) {
        chrome.alarms.create(REFRESH_ALARM_NAME, { periodInMinutes: REFRESH_INTERVAL_MINUTES });
      }
    });
  } catch (_) {
    // ignore; will retry on next wake
  }
}

ensureRefreshAlarm();

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== REFRESH_ALARM_NAME) return;
  const ids = Object.keys(backgroundState.youtubeWatchTabRecordsOfCurrentWindow).map(Number);
  await Promise.all(ids.map(refreshMetricsForTab));
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === backgroundState.trackedWindowId) {
    resetTrackedWindow();
  }
});

chrome.runtime.onStartup?.addListener(ensureRefreshAlarm);
chrome.runtime.onInstalled?.addListener(ensureRefreshAlarm);
