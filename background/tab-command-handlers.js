import { isFiniteNumber, isValidWindowId } from '../shared/guards.js';
import { logDebug } from '../shared/log.js';
import { buildTabSnapshot } from './tab-snapshot.js';
import { applyTabReloadStarted } from './tab-video-state.js';
import { recomputeSortState } from './sort-state.js';
import { applyTabSort } from './apply-tab-sort.js';
import { collectPlaybackMetricsBatch } from './collect-playback-metrics.js';
import { getWritableTabRecord, listTabIds } from './tracked-tab-record-store.js';
import { setTrackedWindowId } from './tracked-window-session.js';
import { trackedWindowStateView } from './tracked-window-state-view.js';
import { reconcileWindowTabRecords } from './tab-record-reconciler.js';
import { shouldRefreshRecordMetrics } from '../shared/tab-readiness/refresh-policy.js';

export async function activateTab(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) return;
  if (isValidWindowId(message.windowId)) {
    setTrackedWindowId(message.windowId, { force: true });
  }
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch (error) {
    logDebug(`tabs.update failed for ${tabId}`, error);
  }
}

export async function reloadTab(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) return;
  if (isValidWindowId(message.windowId)) {
    setTrackedWindowId(message.windowId, { force: true });
  }
  let didReload = false;
  try {
    await chrome.tabs.reload(tabId);
    didReload = true;
  } catch (error) {
    logDebug(`tabs.reload failed for ${tabId}`, error);
  }
  if (!didReload) return;
  const record = getWritableTabRecord(tabId);
  if (!record) return;

  applyTabReloadStarted(record);
  recomputeSortState();
}

export async function syncWindowTabs(message) {
  await reconcileWindowTabRecords(
    message.windowId,
    isValidWindowId(message.windowId) ? { force: true } : undefined,
  );
}

export async function getWindowSnapshot(message) {
  await reconcileWindowTabRecords(
    message.windowId,
    isValidWindowId(message.windowId) ? { force: true } : undefined,
  );
  const ids = listTabIds();
  await collectPlaybackMetricsBatch(ids, { shouldRefresh: shouldRefreshRecordMetrics });
  return buildTabSnapshot();
}

export async function applyTabSortOrder(message) {
  const targetWindowId = isValidWindowId(message.windowId)
    ? message.windowId
    : trackedWindowStateView.windowId;
  if (isValidWindowId(targetWindowId)) {
    setTrackedWindowId(targetWindowId, { force: true });
  }
  await applyTabSort(targetWindowId);
  await reconcileWindowTabRecords(
    targetWindowId,
    isValidWindowId(targetWindowId) ? { force: true } : undefined,
  );
}
