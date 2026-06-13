import { isValidWindowId } from '../shared/guards.js';
import { logDebug, logListenerError, withErrorLogging } from '../shared/log.js';
import { recomputeSortState } from './sort-state.js';
import {
  listTabIds,
  resetTrackedWindowStore,
  setTrackedWindowId,
  trackedWindowStateView,
} from './tracked-window-store.js';
import { collectPlaybackMetricsBatch } from './collect-playback-metrics.js';
import { reconcileWindowTabRecords } from './tab-record-reconciler.js';
import { listWindowTabs } from './chrome-api.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';
import { shouldRefreshRecordMetrics } from '../shared/tab-readiness/refresh-policy.js';

const REFRESH_ALARM_NAME = 'refreshRemaining';
const REFRESH_INTERVAL_MINUTES = 1;
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
  resetTrackedWindowStore();
  recomputeSortState();
}

export async function syncFocusedWindow(windowId) {
  if (!isValidWindowId(windowId)) return;
  if (windowId === trackedWindowStateView.windowId) return;
  setTrackedWindowId(windowId, { force: true });
  await reconcileWindowTabRecords(windowId, { force: true });
}

async function syncInitialWindowState() {
  const lastFocusedWindowId = await getLastFocusedWindowId();
  const targetWindowId =
    isValidWindowId(lastFocusedWindowId) && (await windowHasTrackedYoutubeTabs(lastFocusedWindowId))
      ? lastFocusedWindowId
      : null;
  await reconcileWindowTabRecords(targetWindowId, { force: true });

  const ids = listTabIds();
  if (ids.length) {
    await collectPlaybackMetricsBatch(ids);
  }
}

async function windowHasTrackedYoutubeTabs(windowId) {
  if (!isValidWindowId(windowId)) return false;
  const tabs = await listWindowTabs(windowId);
  return Array.isArray(tabs) && tabs.some((tab) => isWatchOrShortsPage(tab?.url));
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
      await reconcileWindowTabRecords(trackedWindowStateView.windowId, { force: true });
      const ids = listTabIds();
      await collectPlaybackMetricsBatch(ids, { shouldRefresh: shouldRefreshRecordMetrics });
    }),
  );

  chrome.windows.onRemoved.addListener(
    withErrorLogging('windows.onRemoved', async (windowId) => {
      if (windowId === trackedWindowStateView.windowId) {
        resetTrackedWindow();
      }
    }),
  );

  chrome.windows.onFocusChanged.addListener(
    withErrorLogging('windows.onFocusChanged', async (windowId) => {
      await syncFocusedWindow(windowId);
    }),
  );

  chrome.runtime.onStartup?.addListener(ensureRefreshAlarm);
  chrome.runtime.onInstalled?.addListener(ensureRefreshAlarm);
}
