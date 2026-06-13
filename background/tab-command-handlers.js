import { isFiniteNumber, isValidWindowId } from '../shared/guards.js';
import { buildTabSnapshot } from './tab-snapshot.js';
import { applyTabReloadStarted } from './tab-video-state.js';
import { recomputeSortState } from './sort-state.js';
import { applyTabSort } from './apply-tab-sort.js';
import { reloadChromeTab, updateTab } from './chrome-api.js';
import { collectPlaybackMetricsBatch } from './collect-playback-metrics.js';
import {
  getWritableTabRecord,
  listTabIds,
  setTrackedWindowId,
  trackedWindowStateView,
} from './tracked-window-store.js';
import { reconcileWindowTabRecords } from './tab-record-reconciler.js';
import { shouldRefreshRecordMetrics } from '../shared/tab-readiness/refresh-policy.js';

export async function activateTab(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) return;
  if (isValidWindowId(message.windowId)) {
    setTrackedWindowId(message.windowId, { force: true });
  }
  await updateTab(tabId, { active: true });
}

export async function reloadTab(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) return;
  if (isValidWindowId(message.windowId)) {
    setTrackedWindowId(message.windowId, { force: true });
  }
  const didReload = await reloadChromeTab(tabId);
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
  const sortResult = await applyTabSort(targetWindowId);
  await reconcileWindowTabRecords(
    targetWindowId,
    isValidWindowId(targetWindowId) ? { force: true } : undefined,
  );
  return sortResult;
}
