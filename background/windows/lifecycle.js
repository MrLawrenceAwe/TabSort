import { isValidWindowId } from '../../shared/guards.js';
import { logDebug, logListenerError, withErrorLogging } from '../../shared/log.js';
import { recomputeSortState } from '../sorting/state.js';
import {
  listTabIds,
  resetTrackedWindowStore,
  setTrackedWindowId,
  trackedWindow,
} from './store.js';
import { collectPlaybackMetricsBatch } from '../playback/collect.js';
import { reconcileWindowTabRecords } from '../tabs/reconcile.js';
import { listWindowTabs } from '../tabs/chrome-tabs.js';
import { isYouTubeVideoPage } from '../youtube/urls.js';
import { shouldRefreshRecordMetrics } from '../../shared/tab-readiness/refresh-policy.js';

const PLAYBACK_REFRESH_ALARM = 'refreshRemaining';
const REFRESH_INTERVAL_MINUTES = 1;
const MIN_REFRESH_INTERVAL_MINUTES = 1;
const refreshMinutes = Math.max(REFRESH_INTERVAL_MINUTES, MIN_REFRESH_INTERVAL_MINUTES);

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
  if (windowId === trackedWindow.windowId) return;
  setTrackedWindowId(windowId, { force: true });
  await reconcileWindowTabRecords(windowId, { force: true });
}

async function syncInitialWindowState() {
  const lastFocusedWindowId = await getLastFocusedWindowId();
  const targetWindowId =
    isValidWindowId(lastFocusedWindowId) && (await windowHasTrackedYouTubeTabs(lastFocusedWindowId))
      ? lastFocusedWindowId
      : null;
  await reconcileWindowTabRecords(targetWindowId, { force: true });

  const ids = listTabIds();
  if (ids.length) {
    await collectPlaybackMetricsBatch(ids);
  }
}

async function windowHasTrackedYouTubeTabs(windowId) {
  if (!isValidWindowId(windowId)) return false;
  const tabs = await listWindowTabs(windowId);
  return Array.isArray(tabs) && tabs.some((tab) => isYouTubeVideoPage(tab?.url));
}

function ensureRefreshAlarm() {
  try {
    chrome.alarms.get(PLAYBACK_REFRESH_ALARM, (alarm) => {
      if (chrome.runtime.lastError) {
        console.debug(`[TabSort] alarm get failed: ${chrome.runtime.lastError.message}`);
        return;
      }

      const needsCreate =
        !alarm ||
        !Number.isFinite(alarm.periodInMinutes) ||
        Math.abs(alarm.periodInMinutes - refreshMinutes) > 1e-6;
      if (!needsCreate) return;

      try {
        chrome.alarms.create(PLAYBACK_REFRESH_ALARM, { periodInMinutes: refreshMinutes });
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
      if (alarm.name !== PLAYBACK_REFRESH_ALARM) return;
      await reconcileWindowTabRecords(trackedWindow.windowId, { force: true });
      const ids = listTabIds();
      await collectPlaybackMetricsBatch(ids, { shouldRefresh: shouldRefreshRecordMetrics });
    }),
  );

  chrome.windows.onRemoved.addListener(
    withErrorLogging('windows.onRemoved', async (windowId) => {
      if (windowId === trackedWindow.windowId) {
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
