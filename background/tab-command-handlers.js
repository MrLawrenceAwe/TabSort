import { isFiniteNumber, isValidWindowId } from '../shared/guards.js';
import { logDebug } from '../shared/log.js';
import { buildTabSnapshot } from './tab-snapshot.js';
import { markTabRecordReloading } from './tab-record-lifecycle.js';
import { recomputeSortState } from './sort-state.js';
import { applyTabSort } from './apply-tab-sort.js';
import { refreshPlaybackStateBatch } from './refresh-playback-state.js';
import {
  getMutableTabRecord,
  listTabIds,
  readonlyTrackedWindowState,
  setTrackedWindowId,
} from './window-store.js';
import { reconcileWindowTabRecords } from './tab-record-reconciler.js';
import { shouldRefreshRecordMetrics } from '../shared/tab-refresh-policy.js';

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
  const record = getMutableTabRecord(tabId);
  if (!record) return;

  markTabRecordReloading(record);
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
  await refreshPlaybackStateBatch(ids, { shouldRefresh: shouldRefreshRecordMetrics });
  return buildTabSnapshot();
}

export async function applyTabSortOrder(message) {
  const targetWindowId = isValidWindowId(message.windowId)
    ? message.windowId
    : readonlyTrackedWindowState.windowId;
  if (isValidWindowId(targetWindowId)) {
    setTrackedWindowId(targetWindowId, { force: true });
  }
  await applyTabSort(targetWindowId);
  await reconcileWindowTabRecords(
    targetWindowId,
    isValidWindowId(targetWindowId) ? { force: true } : undefined,
  );
}
