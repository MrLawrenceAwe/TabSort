import { isFiniteNumber, isValidWindowId } from '../../shared/guards.js';
import { buildTabSnapshot } from '../tab-snapshot.js';
import { applyTabReloadStarted } from '../tabs/video-state.js';
import { recomputeSortState } from '../sorting/state.js';
import { sortTabs } from '../sorting/apply.js';
import { reloadChromeTab, updateTab } from '../tabs/chrome-tabs.js';
import { collectPlaybackMetricsBatch } from '../playback/collect.js';
import {
  getMutableTabRecord,
  isSyncTokenCurrent,
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
  const requestedWindowId = isValidWindowId(message.windowId) ? message.windowId : null;
  const reconciliation = await reconcileWindowTabRecords(
    message.windowId,
    requestedWindowId != null ? { force: true } : undefined,
  );
  if (
    !reconciliation?.ok ||
    !reconciliation.applied ||
    (requestedWindowId != null && reconciliation.windowId !== requestedWindowId)
  ) {
    return {
      ok: false,
      error: reconciliation?.reason || 'windowSyncUnavailable',
      windowId: requestedWindowId,
    };
  }

  const ids = listTabIds();
  await collectPlaybackMetricsBatch(ids, { shouldRefresh: shouldRefreshRecordMetrics });
  if (
    !isSyncTokenCurrent(reconciliation.syncToken) ||
    (requestedWindowId != null && trackedWindow.windowId !== requestedWindowId)
  ) {
    return { ok: false, error: 'windowSyncSuperseded', windowId: requestedWindowId };
  }
  return buildTabSnapshot();
}

export async function handleSortTabs(message) {
  const targetWindowId = isValidWindowId(message.windowId)
    ? message.windowId
    : trackedWindow.windowId;
  const reconciliation = await reconcileWindowTabRecords(
    targetWindowId,
    isValidWindowId(targetWindowId) ? { force: true } : undefined,
  );
  if (
    !reconciliation?.ok ||
    !reconciliation.applied ||
    reconciliation.windowId !== targetWindowId
  ) {
    return {
      ok: false,
      movedCount: 0,
      skippedReason: reconciliation?.reason || 'windowSyncUnavailable',
    };
  }

  const sortResult = await sortTabs(targetWindowId, {
    expectedSyncToken: reconciliation.syncToken,
  });
  if (isSyncTokenCurrent(reconciliation.syncToken)) {
    await reconcileWindowTabRecords(targetWindowId, { force: true });
  }
  return sortResult;
}
