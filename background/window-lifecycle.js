import { REFRESH_ALARM_NAME, REFRESH_INTERVAL_MINUTES } from '../shared/constants.js';
import { isValidWindowId } from '../shared/utils.js';
import { recomputeSorting } from './ordering.js';
import { backgroundState, setTrackedWindowIdIfNeeded } from './state.js';
import { refreshTabMetrics, syncTrackedTabs } from './tracked-tabs.js';
import { logListenerError, withErrorLogging } from './listener-helpers.js';

const MIN_REFRESH_INTERVAL_MINUTES = 1;
const refreshIntervalMinutes = Math.max(REFRESH_INTERVAL_MINUTES, MIN_REFRESH_INTERVAL_MINUTES);

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

export function resetTrackedWindow() {
  setTrackedWindowIdIfNeeded(null, { force: true });
  backgroundState.trackedVideoTabsById = {};
  backgroundState.lastBroadcastSignature = null;
  recomputeSorting();
}

async function rehydrateTrackedWindowState() {
  const lastFocusedWindowId = await getLastFocusedWindowId();
  const targetWindowId = isValidWindowId(lastFocusedWindowId) ? lastFocusedWindowId : null;
  await syncTrackedTabs(targetWindowId, { force: true });

  const ids = Object.keys(backgroundState.trackedVideoTabsById).map(Number);
  if (ids.length) {
    await Promise.all(ids.map(refreshTabMetrics));
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
  } catch (_) {}
}

export function initializeWindowLifecycle() {
  ensureRefreshAlarm();
  rehydrateTrackedWindowState().catch((error) => logListenerError('rehydration', error));

  chrome.alarms.onAlarm.addListener(
    withErrorLogging('alarms.onAlarm', async (alarm) => {
      if (alarm.name !== REFRESH_ALARM_NAME) return;
      await syncTrackedTabs(backgroundState.trackedWindowId, { force: true });
      const ids = Object.keys(backgroundState.trackedVideoTabsById).map(Number);
      await Promise.all(ids.map(refreshTabMetrics));
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
      setTrackedWindowIdIfNeeded(windowId, { force: true });
      await syncTrackedTabs(windowId, { force: true });
    }),
  );

  chrome.runtime.onStartup?.addListener(ensureRefreshAlarm);
  chrome.runtime.onInstalled?.addListener(ensureRefreshAlarm);
}
