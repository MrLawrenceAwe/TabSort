import { REFRESH_ALARM_NAME, REFRESH_INTERVAL_MINUTES } from '../shared/constants.js';
import { isValidWindowId } from '../shared/guards.js';
import { backgroundStore, updateTrackedWindowId } from './store.js';
import { logListenerError, withErrorLogging } from './listener-helpers.js';
import { recomputeSortState } from './sort-state.js';
import { refreshTrackedTab, syncTrackedWindowTabs } from './tracked-tabs.js';
import { logDebug } from '../shared/log.js';

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
  updateTrackedWindowId(null, { force: true });
  backgroundStore.trackedTabsById = {};
  backgroundStore.snapshotSignature = null;
  recomputeSortState();
}

async function rehydrateTrackedTabs() {
  const lastFocusedWindowId = await getLastFocusedWindowId();
  const targetWindowId = isValidWindowId(lastFocusedWindowId) ? lastFocusedWindowId : null;
  await syncTrackedWindowTabs(targetWindowId, { force: true });

  const ids = Object.keys(backgroundStore.trackedTabsById).map(Number);
  if (ids.length) {
    await Promise.all(ids.map(refreshTrackedTab));
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
      await syncTrackedWindowTabs(backgroundStore.trackedWindowId, { force: true });
      const ids = Object.keys(backgroundStore.trackedTabsById).map(Number);
      await Promise.all(ids.map(refreshTrackedTab));
    }),
  );

  chrome.windows.onRemoved.addListener(
    withErrorLogging('windows.onRemoved', async (windowId) => {
      if (windowId === backgroundStore.trackedWindowId) {
        resetTrackedWindow();
      }
    }),
  );

  chrome.windows.onFocusChanged.addListener(
    withErrorLogging('windows.onFocusChanged', async (windowId) => {
      if (!isValidWindowId(windowId)) return;
      if (windowId === backgroundStore.trackedWindowId) return;
      updateTrackedWindowId(windowId, { force: true });
      await syncTrackedWindowTabs(windowId, { force: true });
    }),
  );

  chrome.runtime.onStartup?.addListener(ensureRefreshAlarm);
  chrome.runtime.onInstalled?.addListener(ensureRefreshAlarm);
}
