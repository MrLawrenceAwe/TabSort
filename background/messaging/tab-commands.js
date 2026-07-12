import { isFiniteNumber, isValidWindowId } from '../../shared/guards.js';
import { buildTabSnapshot } from '../tab-snapshot.js';
import { applyTabReloadStarted } from '../tabs/video-state.js';
import { recomputeSortState } from '../sorting/state.js';
import { sortTabs } from '../sorting/apply.js';
import { reloadChromeTab, updateTab } from '../tabs/chrome-tabs.js';
import { collectPlaybackMetricsBatch } from '../playback/collect.js';
import {
  getMutableTabRecord,
  listTabIds,
  setTrackedWindowId,
  trackedWindow,
} from '../windows/store.js';
import { reconcileWindowTabRecords } from '../tabs/reconcile.js';
import { shouldRefreshRecordMetrics } from '../../shared/tab-readiness/refresh-policy.js';

export async function openTab(message) {
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
  const record = getMutableTabRecord(tabId);
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

export async function handleSortTabs(message) {
  const targetWindowId = isValidWindowId(message.windowId)
    ? message.windowId
    : trackedWindow.windowId;
  await reconcileWindowTabRecords(
    targetWindowId,
    isValidWindowId(targetWindowId) ? { force: true } : undefined,
  );
  const sortResult = await sortTabs(targetWindowId);
  await reconcileWindowTabRecords(
    targetWindowId,
    isValidWindowId(targetWindowId) ? { force: true } : undefined,
  );
  return sortResult;
}
