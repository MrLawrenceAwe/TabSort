import { isValidWindowId } from '../../shared/guards.js';
import { getTabLoadState, listWindowTabs } from './chrome-tabs.js';
import { updateSortStateAndBroadcast } from '../sorting/update-sort-state.js';
import { reconcileTabRecord } from './reconcile-tab-record.js';
import {
  getTabRecordsById,
  getTrackedWindowId,
  isSyncTokenCurrent,
  nextSyncToken,
  replaceAllTabRecords,
  replaceOrderedWindowTabs,
  setTrackedWindowId,
} from '../windows/store.js';
import { hasYouTubeVideoChanged, isYouTubeVideoPage } from '../../shared/youtube/urls.js';
import { readAutoPreparedTabs, restoreAutoPreparedTab } from '../auto-preparation/session-cache.js';

function resolveWindowIdForQuery(windowId, { force = false } = {}) {
  const currentWindowId = getTrackedWindowId();
  if (isValidWindowId(windowId) && (force || currentWindowId == null)) return windowId;
  if (force && windowId == null) return null;
  return currentWindowId;
}

function resolveQueriedWindowId(resolvedWindowId, tabs) {
  if (isValidWindowId(resolvedWindowId)) return resolvedWindowId;
  const windowIds = new Set(
    tabs.map((tab) => tab?.windowId).filter((windowId) => isValidWindowId(windowId)),
  );
  return windowIds.size === 1 ? windowIds.values().next().value : null;
}

export async function reconcileWindowTabRecords(windowId, options = {}) {
  const syncToken = nextSyncToken();
  const resolvedWindowId = resolveWindowIdForQuery(windowId, options);
  const tabs = await listWindowTabs(resolvedWindowId);
  const autoPreparedTabs = await readAutoPreparedTabs();
  if (!isSyncTokenCurrent(syncToken)) {
    return { ok: false, applied: false, reason: 'superseded', windowId: resolvedWindowId };
  }
  if (!Array.isArray(tabs)) {
    return { ok: false, applied: false, reason: 'tabsUnavailable', windowId: resolvedWindowId };
  }
  if (resolvedWindowId == null && tabs.length === 0) {
    return { ok: true, applied: false, reason: 'emptyWindow', windowId: null, syncToken };
  }
  const queriedWindowId = resolveQueriedWindowId(resolvedWindowId, tabs);
  if (!isValidWindowId(queriedWindowId)) {
    return { ok: false, applied: false, reason: 'windowUnavailable', windowId: null };
  }
  setTrackedWindowId(queriedWindowId, options);

  if (
    isValidWindowId(getTrackedWindowId()) &&
    queriedWindowId !== getTrackedWindowId()
  ) {
    return { ok: false, applied: false, reason: 'windowNotClaimed', windowId: queriedWindowId };
  }

  const previousTabRecords = getTabRecordsById();
  const nextTabRecords = {};

  for (const tab of tabs) {
    if (!isYouTubeVideoPage(tab.url)) continue;

    const previousTabRecord = previousTabRecords[tab.id] || {};
    const videoChanged = hasYouTubeVideoChanged(previousTabRecord.url, tab.url);
    const nextLoadState = getTabLoadState(tab);
    const nextTabRecord = reconcileTabRecord(tab, previousTabRecord, nextLoadState, {
      videoChanged,
    });

    nextTabRecords[tab.id] = restoreAutoPreparedTab(tab, nextTabRecord, autoPreparedTabs);
  }

  if (!isSyncTokenCurrent(syncToken)) {
    return { ok: false, applied: false, reason: 'superseded', windowId: resolvedWindowId };
  }
  replaceOrderedWindowTabs(tabs);
  replaceAllTabRecords(nextTabRecords);
  updateSortStateAndBroadcast();
  return { ok: true, applied: true, windowId: queriedWindowId, syncToken };
}
