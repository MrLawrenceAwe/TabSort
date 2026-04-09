import { REFRESH_ALARM_NAME, REFRESH_INTERVAL_MINUTES } from '../shared/constants.js';
import { isValidWindowId } from '../shared/utils.js';
import { logDebug, logListenerError, withErrorLogging } from '../shared/log.js';
import { recomputeSortState } from './sort-state.js';
import { setTrackedWindowId, trackingState } from './tracking-state.js';
import { refreshTabPlaybackState } from './tab-playback-state.js';
import { syncTrackedTabsForWindow } from './tracked-tab-sync.js';

const MIN_REFRESH_INTERVAL_MINUTES = 1;
const refreshIntervalMinutes = Math.max(REFRESH_INTERVAL_MINUTES, MIN_REFRESH_INTERVAL_MINUTES);

const getLastFocusedWindowId = () =>
  new Promise((resolve) => {
    try {
      chrome.windows.getLastFocused({ populate: false }, (win) => {
        const err = chrome.runtime.lastError;
        if (err) {
          logDebug('windows.getLastFocused failed', err);
          resolve(null);
          return;
        }
        resolve(typeof win?.id === 'number' ? win.id : null);
      });
    } catch (error) {
      logDebug('windows.getLastFocused threw', error);
      resolve(null);
    }
  });

export function resetTrackedWindow() {
  setTrackedWindowId(null, { force: true });
  trackingState.trackedTabsById = {};
  trackingState.snapshotSignature = null;
  recomputeSortState();
}

async function rehydrateTrackedTabs() {
  const lastFocusedWindowId = await getLastFocusedWindowId();
  const targetWindowId = isValidWindowId(lastFocusedWindowId) ? lastFocusedWindowId : null;
  await syncTrackedTabsForWindow(targetWindowId, { force: true });

  const ids = Object.keys(trackingState.trackedTabsById).map(Number);
  if (ids.length) {
    await Promise.all(ids.map(refreshTabPlaybackState));
  }
}

export function ensureRefreshAlarm() {
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
  } catch (error) {
    logDebug('ensureRefreshAlarm failed', error);
  }
}

export function initializeWindowLifecycle() {
  ensureRefreshAlarm();
  rehydrateTrackedTabs().catch((error) => logListenerError('rehydration', error));

  chrome.alarms.onAlarm.addListener(
    withErrorLogging('alarms.onAlarm', async (alarm) => {
      if (alarm.name !== REFRESH_ALARM_NAME) return;
      await syncTrackedTabsForWindow(trackingState.trackedWindowId, { force: true });
      const ids = Object.keys(trackingState.trackedTabsById).map(Number);
      await Promise.all(ids.map(refreshTabPlaybackState));
    }),
  );

  chrome.windows.onRemoved.addListener(
    withErrorLogging('windows.onRemoved', async (windowId) => {
      if (windowId === trackingState.trackedWindowId) {
        resetTrackedWindow();
      }
    }),
  );

  chrome.windows.onFocusChanged.addListener(
    withErrorLogging('windows.onFocusChanged', async (windowId) => {
      if (!isValidWindowId(windowId)) return;
      if (windowId === trackingState.trackedWindowId) return;
      setTrackedWindowId(windowId, { force: true });
      await syncTrackedTabsForWindow(windowId, { force: true });
    }),
  );

  chrome.runtime.onStartup?.addListener(ensureRefreshAlarm);
  chrome.runtime.onInstalled?.addListener(ensureRefreshAlarm);
}
