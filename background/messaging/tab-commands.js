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
  trackedWindow,
} from '../windows/store.js';
import { reconcileWindowTabRecords } from '../tabs/reconcile.js';
import { shouldRefreshRecordMetrics } from '../../shared/tab-readiness/refresh-policy.js';

export async function openTab(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) {
    return { ok: false, error: 'invalidTabId' };
  }
  const record = getMutableTabRecord(tabId);
  if (!record) {
    return { ok: false, error: 'tabNotTracked' };
  }
  if (
    isValidWindowId(message.windowId) &&
    isValidWindowId(record.windowId) &&
    message.windowId !== record.windowId
  ) {
    return { ok: false, error: 'windowMismatch' };
  }
  const didOpen = await updateTab(tabId, { active: true });
  return didOpen
    ? { ok: true, tabId }
    : { ok: false, error: 'openFailed', tabId };
}

export async function reloadTab(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) {
    return { ok: false, error: 'invalidTabId' };
  }
  const record = getMutableTabRecord(tabId);
  if (!record) {
    return { ok: false, error: 'tabNotTracked' };
  }
  if (
    isValidWindowId(message.windowId) &&
    isValidWindowId(record.windowId) &&
    message.windowId !== record.windowId
  ) {
    return { ok: false, error: 'windowMismatch' };
  }
  const didReload = await reloadChromeTab(tabId);
  if (!didReload) {
    return { ok: false, error: 'reloadFailed', tabId };
  }

  applyTabReloadStarted(record);
  recomputeSortState();
  return { ok: true, tabId };
}

export async function syncWindowTabs(message) {
  return reconcileWindowTabRecords(
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
    (isValidWindowId(targetWindowId) && reconciliation.windowId !== targetWindowId)
  ) {
    return {
      ok: false,
      movedCount: 0,
      skippedReason: reconciliation?.reason || 'windowSyncUnavailable',
    };
  }

  const resolvedTargetWindowId = reconciliation.windowId;
  const sortResult = await sortTabs(resolvedTargetWindowId, {
    expectedSyncToken: reconciliation.syncToken,
  });
  if (isSyncTokenCurrent(reconciliation.syncToken)) {
    await reconcileWindowTabRecords(resolvedTargetWindowId, { force: true });
  }
  return sortResult;
}
