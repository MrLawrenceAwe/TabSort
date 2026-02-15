
import { REFRESH_INTERVAL_MINUTES, REFRESH_ALARM_NAME } from '../shared/constants.js';
import { isValidWindowId } from '../shared/utils.js';
import {
  refreshMetricsForTab,
  updateYoutubeWatchTabRecords,
} from './tab-orchestration.js';
import { recomputeSorting } from './ordering.js';
import { backgroundState, resolveTrackedWindowId } from './state.js';
import { isWatch } from './youtube-url-utils.js';
import { getTab } from './tab-service.js';
import {
  activateTab,
  reloadTab,
} from './handlers/tab-actions.js';
import {
  handleUpdateYoutubeWatchTabRecords,
  handleSendTabRecords,
  handleAreTabsInCurrentWindowKnownToBeSorted,
  handleSortTabs,
} from './handlers/records-handler.js';
import {
  handleContentScriptReady,
  handleMetadataLoaded,
  handleLightweightDetails,
} from './handlers/content-script.js';
import { createAsyncResponder } from './async-responder.js';

const logListenerError = (label, error) => {
  const message = error?.message || String(error);
  console.debug(`[TabSort] ${label} failed: ${message}`);
};

const withErrorLogging = (label, fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (error) {
    logListenerError(label, error);
  }
};

const getLastFocusedWindowId = () =>
  new Promise((resolve) => {
    try {
      chrome.windows.getLastFocused({ populate: false }, (win) => {
        const err = chrome.runtime.lastError;
        if (err) {
          resolve(null);
          return;
        }
        resolve(typeof win?.id === 'number' ? win.id : null);
      });
    } catch (_) {
      resolve(null);
    }
  });

const shouldHandleWindow = (windowId) =>
  backgroundState.trackedWindowId == null || windowId === backgroundState.trackedWindowId;

const refreshForTabWindowChange = (label, getWindowId) =>
  withErrorLogging(label, async (...args) => {
    const windowId = getWindowId(...args);
    if (!isValidWindowId(windowId)) return;
    if (!shouldHandleWindow(windowId)) return;
    await updateYoutubeWatchTabRecords(windowId);
  });

const MIN_REFRESH_INTERVAL_MINUTES = 1;
const refreshIntervalMinutes = Math.max(REFRESH_INTERVAL_MINUTES, MIN_REFRESH_INTERVAL_MINUTES);

function resetTrackedWindow() {
  resolveTrackedWindowId(null, { force: true });
  backgroundState.watchTabRecordsById = {};
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

chrome.tabs.onUpdated.addListener(
  withErrorLogging('tabs.onUpdated', async (tabId, changeInfo, tab) => {
    if (!tab) return;
    if (!shouldHandleWindow(tab.windowId)) return;
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
  }),
);

chrome.tabs.onMoved.addListener(
  refreshForTabWindowChange('tabs.onMoved', (_tabId, moveInfo) => moveInfo?.windowId),
);

chrome.tabs.onDetached.addListener(
  refreshForTabWindowChange('tabs.onDetached', (_tabId, detachInfo) => detachInfo?.oldWindowId),
);

chrome.tabs.onAttached.addListener(
  refreshForTabWindowChange('tabs.onAttached', (_tabId, attachInfo) => attachInfo?.newWindowId),
);

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (!shouldHandleWindow(removeInfo?.windowId)) return;
  delete backgroundState.watchTabRecordsById[tabId];
  if (removeInfo?.isWindowClosing && removeInfo.windowId === backgroundState.trackedWindowId) {
    resetTrackedWindow();
    return;
  }
  recomputeSorting();
});

if (chrome.webNavigation?.onHistoryStateUpdated) {
  chrome.webNavigation.onHistoryStateUpdated.addListener(
    withErrorLogging('webNavigation.onHistoryStateUpdated', async (details) => {
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
    }),
    { url: [{ hostContains: 'youtube.com' }] },
  );
} else {
  console.warn(
    '[TabSort] webNavigation API unavailable (missing permission?); falling back to tabs.onUpdated only.',
  );
}

async function rehydrateTrackedWindowState() {
  const lastFocusedWindowId = await getLastFocusedWindowId();
  const targetWindowId = isValidWindowId(lastFocusedWindowId) ? lastFocusedWindowId : null;
  await updateYoutubeWatchTabRecords(targetWindowId, { force: true });
  const ids = Object.keys(backgroundState.watchTabRecordsById).map(Number);
  if (ids.length) {
    await Promise.all(ids.map(refreshMetricsForTab));
  }
}

function ensureRefreshAlarm() {
  try {
    chrome.alarms.get(REFRESH_ALARM_NAME, (alarm) => {
      if (chrome.runtime.lastError) {
        console.debug(`[TabSort] alarm get failed: ${chrome.runtime.lastError.message}`);
        return;
      }
      const needsCreate =
        !alarm ||
        !Number.isFinite(alarm.periodInMinutes) ||
        Math.abs(alarm.periodInMinutes - refreshIntervalMinutes) > 1e-6;
      if (!needsCreate) return;
      try {
        chrome.alarms.create(REFRESH_ALARM_NAME, { periodInMinutes: refreshIntervalMinutes });
      } catch (error) {
        console.debug(`[TabSort] alarm create failed: ${error.message}`);
      }
    });
  } catch (_) {
    // ignore; will retry on next wake
  }
}

ensureRefreshAlarm();
rehydrateTrackedWindowState().catch((error) => logListenerError('rehydration', error));

chrome.alarms.onAlarm.addListener(
  withErrorLogging('alarms.onAlarm', async (alarm) => {
    if (alarm.name !== REFRESH_ALARM_NAME) return;
    await updateYoutubeWatchTabRecords(backgroundState.trackedWindowId, { force: true });
    const ids = Object.keys(backgroundState.watchTabRecordsById).map(Number);
    await Promise.all(ids.map(refreshMetricsForTab));
  }),
);

chrome.windows.onRemoved.addListener(
  withErrorLogging('windows.onRemoved', async (windowId) => {
    if (windowId === backgroundState.trackedWindowId) {
      resetTrackedWindow();
    }
  }),
);

chrome.windows.onFocusChanged.addListener(
  withErrorLogging('windows.onFocusChanged', async (windowId) => {
    if (!isValidWindowId(windowId)) return;
    if (windowId === backgroundState.trackedWindowId) return;
    resolveTrackedWindowId(windowId, { force: true });
    await updateYoutubeWatchTabRecords(windowId, { force: true });
  }),
);

chrome.runtime.onStartup?.addListener(ensureRefreshAlarm);
chrome.runtime.onInstalled?.addListener(ensureRefreshAlarm);
