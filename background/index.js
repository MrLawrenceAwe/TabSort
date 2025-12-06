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
import { ensureTabRecord } from './tab-record.js';
import { getTab } from './tab-service.js';

function canUseSenderWindow(windowId) {
  if (backgroundState.trackedWindowId == null) return true;
  return typeof windowId === 'number' && windowId === backgroundState.trackedWindowId;
}

function hasExplicitWindowId(windowId) {
  return typeof windowId === 'number' && Number.isFinite(windowId);
}

function buildForceOption(windowId) {
  return hasExplicitWindowId(windowId) ? { force: true } : undefined;
}

function resetTrackedWindow() {
  resolveTrackedWindowId(null, { force: true });
  backgroundState.youtubeWatchTabRecordsOfCurrentWindow = {};
  backgroundState.lastBroadcastSignature = null;
  recomputeSorting();
}

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
      await updateYoutubeWatchTabRecords(message.windowId, buildForceOption(message.windowId));
    },
    sendTabRecords: async () => {
      await updateYoutubeWatchTabRecords(message.windowId, buildForceOption(message.windowId));
      const ids = Object.keys(backgroundState.youtubeWatchTabRecordsOfCurrentWindow).map(Number);
      await Promise.all(ids.map(refreshMetricsForTab));
      return buildTabSnapshot();
    },
    areTabsInCurrentWindowKnownToBeSorted: async () => {
      await updateYoutubeWatchTabRecords(message.windowId, buildForceOption(message.windowId));
      return backgroundState.tabsInCurrentWindowAreKnownToBeSorted;
    },
    sortTabs: async () => {
      if (hasExplicitWindowId(message.windowId)) {
        resolveTrackedWindowId(message.windowId, { force: true });
      }
      await sortTabsInCurrentWindow();
      await updateYoutubeWatchTabRecords(backgroundState.trackedWindowId);
    },
    ping: async () => ({ ok: true }),
    activateTab: async () => {
      const tabId = message.tabId;
      if (!tabId) return;
      if (hasExplicitWindowId(message.windowId)) {
        resolveTrackedWindowId(message.windowId, { force: true });
      }
      try {
        await chrome.tabs.update(tabId, { active: true });
      } catch (_) {
        // ignore activation failure
      }
    },
    reloadTab: async () => {
      const tabId = message.tabId;
      if (!tabId) return;
      if (hasExplicitWindowId(message.windowId)) {
        resolveTrackedWindowId(message.windowId, { force: true });
      }
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
      const senderWindowId = sender?.tab?.windowId;
      if (!canUseSenderWindow(senderWindowId)) return;
      resolveTrackedWindowId(senderWindowId);
      if (!tabId) return;
      const record = ensureTabRecord(tabId, senderWindowId);
      record.contentScriptReady = true;
      broadcastTabSnapshot();
      await refreshMetricsForTab(tabId);
      return { message: 'contentScriptAck' };
    },
    metadataLoaded: async () => {
      const tabId = sender?.tab?.id;
      const senderWindowId = sender?.tab?.windowId;
      if (!canUseSenderWindow(senderWindowId)) return;
      resolveTrackedWindowId(senderWindowId);
      if (!tabId) return;
      const record = backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId];
      if (record) record.metadataLoaded = true;
      broadcastTabSnapshot();
      await refreshMetricsForTab(tabId);
    },
    lightweightDetails: async () => {
      const tabId = sender?.tab?.id;
      const details = message.details || {};
      const senderWindowId = sender?.tab?.windowId;
      if (!canUseSenderWindow(senderWindowId)) return;
      resolveTrackedWindowId(senderWindowId);
      if (!tabId) return;
      const record = ensureTabRecord(tabId, senderWindowId, {
        url: details.url || sender?.tab?.url,
      });
      if (details.url) record.url = details.url;
      record.videoDetails = record.videoDetails || {};
      if (details.title) record.videoDetails.title = details.title;
      if (typeof details.lengthSeconds === 'number' && isFinite(details.lengthSeconds)) {
        record.videoDetails.lengthSeconds = details.lengthSeconds;
        if (record.videoDetails.remainingTime == null) {
          record.videoDetails.remainingTime = details.lengthSeconds;
        }
      }
      if (typeof details.isLive === 'boolean') record.isLiveStream = details.isLive;
      recomputeSorting();
    },
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

const REFRESH_ALARM_NAME = 'refreshRemaining';

function ensureRefreshAlarm() {
  try {
    chrome.alarms.get(REFRESH_ALARM_NAME, (alarm) => {
      if (chrome.runtime.lastError) {
        console.debug(`[TabSort] alarm get failed: ${chrome.runtime.lastError.message}`);
        return;
      }
      if (!alarm) {
        chrome.alarms.create(REFRESH_ALARM_NAME, { periodInMinutes: 0.5 });
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
