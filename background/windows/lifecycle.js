import { getProgressWindowId } from '../auto-preparation/state.js';
import { onAutoPreparationWindowRemoved, recoverAutoPreparation } from '../auto-preparation/service.js';
import { isValidWindowId } from '../../shared/guards.js';
import { logDebug, logListenerError, withErrorLogging } from '../../shared/log.js';
import { updateSortStateAndBroadcast } from '../sorting/update-sort-state.js';
import {
  getTrackedWindowId,
  listTabIds,
  resetTrackedWindowStore,
} from './tracked-window-store.js';
import { collectPlaybackMetricsBatch } from '../playback/collect.js';
import { reconcileWindowTabRecords } from '../tabs/reconcile-window.js';
import { listWindowTabs } from '../tabs/chrome-tabs.js';
import { isYouTubeVideoPage } from '../../shared/youtube/urls.js';
import { shouldRefreshRecordMetrics } from '../../shared/tabs/refresh-policy.js';

const PLAYBACK_REFRESH_ALARM = 'refreshRemaining';
const REFRESH_INTERVAL_MINUTES = 1;
let focusSyncGeneration = 0;

async function getLastFocusedWindowId() {
  try {
    const win = await chrome.windows.getLastFocused({ populate: false });
    return typeof win?.id === 'number' ? win.id : null;
  } catch (error) {
    logDebug('windows.getLastFocused failed', error);
    return null;
  }
}

export function resetTrackedWindow() {
  resetTrackedWindowStore();
  updateSortStateAndBroadcast();
}

export async function syncFocusedWindow(windowId) {
  if (!isValidWindowId(windowId) || windowId === getProgressWindowId()) return;
  focusSyncGeneration += 1;
  // Even the current window must supersede an in-flight sync to another one.
  await reconcileWindowTabRecords(windowId, { force: true });
}

export async function syncInitialWindowState() {
  const initialFocusGeneration = focusSyncGeneration;
  const lastFocusedWindowId = await getLastFocusedWindowId();
  if (initialFocusGeneration !== focusSyncGeneration) return;
  const targetWindowId =
    isValidWindowId(lastFocusedWindowId) && (await windowHasTrackedYouTubeTabs(lastFocusedWindowId))
      ? lastFocusedWindowId
      : null;
  if (initialFocusGeneration !== focusSyncGeneration) return;
  await reconcileWindowTabRecords(targetWindowId, { force: true });

  if (initialFocusGeneration !== focusSyncGeneration) return;
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

async function ensureRefreshAlarm() {
  try {
    const alarm = await chrome.alarms.get(PLAYBACK_REFRESH_ALARM);
    if (alarm?.periodInMinutes === REFRESH_INTERVAL_MINUTES) return;
    await chrome.alarms.create(PLAYBACK_REFRESH_ALARM, { periodInMinutes: REFRESH_INTERVAL_MINUTES });
  } catch (error) {
    logDebug('ensureRefreshAlarm failed', error);
  }
}

export function initializeWindowLifecycle() {
  ensureRefreshAlarm();
  recoverAutoPreparation().then(() => syncInitialWindowState()).catch((error) => logListenerError('initial window sync', error));

  chrome.alarms.onAlarm.addListener(
    withErrorLogging('alarms.onAlarm', async (alarm) => {
      if (alarm.name !== PLAYBACK_REFRESH_ALARM) return;
      await reconcileWindowTabRecords(getTrackedWindowId(), { force: true });
      const ids = listTabIds();
      await collectPlaybackMetricsBatch(ids, { shouldRefresh: shouldRefreshRecordMetrics });
    }),
  );

  chrome.windows.onRemoved.addListener(
    withErrorLogging('windows.onRemoved', async (windowId) => {
      onAutoPreparationWindowRemoved(windowId);
      if (windowId === getTrackedWindowId()) {
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
