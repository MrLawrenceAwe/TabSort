import { REFRESH_ALARM_NAME, REFRESH_INTERVAL_MINUTES } from './refresh-config.js';
import { isValidWindowId } from '../shared/guards.js';
import { logDebug, logListenerError, withErrorLogging } from '../shared/log.js';
import { recomputeSortState } from './sort-state.js';
import {
  listTabIds,
  trackedWindowState,
  resetTrackedWindowState as resetBackgroundTrackedWindowState,
  setWindowId,
} from './tracked-window-store.js';
import { refreshTabPlaybackState } from './tab-playback-sync.js';
import { syncWindowTabRecords } from './tab-record-sync.js';

const MIN_REFRESH_INTERVAL_MINUTES = 1;
const refreshIntervalMinutes = Math.max(REFRESH_INTERVAL_MINUTES, MIN_REFRESH_INTERVAL_MINUTES);

const getLastFocusedWindowId = () =>
  new Promise((resolve) => {
    try {
      chrome.windows.getLastFocused({ populate: false }, (win) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          logDebug('windows.getLastFocused failed', runtimeError);
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
  resetBackgroundTrackedWindowState();
  recomputeSortState();
}

async function syncInitialWindowState() {
  const lastFocusedWindowId = await getLastFocusedWindowId();
  const targetWindowId = isValidWindowId(lastFocusedWindowId) ? lastFocusedWindowId : null;
  await syncWindowTabRecords(targetWindowId, { force: true });

  const ids = listTabIds();
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
  syncInitialWindowState().catch((error) => logListenerError('initial window sync', error));

  chrome.alarms.onAlarm.addListener(
    withErrorLogging('alarms.onAlarm', async (alarm) => {
      if (alarm.name !== REFRESH_ALARM_NAME) return;
      await syncWindowTabRecords(trackedWindowState.windowId, { force: true });
      const ids = listTabIds();
      await Promise.all(ids.map(refreshTabPlaybackState));
    }),
  );

  chrome.windows.onRemoved.addListener(
    withErrorLogging('windows.onRemoved', async (windowId) => {
      if (windowId === trackedWindowState.windowId) {
        resetTrackedWindow();
      }
    }),
  );

  chrome.windows.onFocusChanged.addListener(
    withErrorLogging('windows.onFocusChanged', async (windowId) => {
      if (!isValidWindowId(windowId)) return;
      if (windowId === trackedWindowState.windowId) return;
      setWindowId(windowId, { force: true });
      await syncWindowTabRecords(windowId, { force: true });
    }),
  );

  chrome.runtime.onStartup?.addListener(ensureRefreshAlarm);
  chrome.runtime.onInstalled?.addListener(ensureRefreshAlarm);
}
