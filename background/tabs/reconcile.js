import { isValidWindowId } from '../../shared/guards.js';
import { getTabState, listWindowTabs } from './chrome-tabs.js';
import { recomputeSortState } from '../sorting/state.js';
import { createRecordFromTab } from './record-from-tab.js';
import {
  getTabRecordsById,
  getTrackedWindowId,
  isSyncTokenCurrent,
  nextSyncToken,
  replaceAllTabRecords,
  replaceTabsInWindowOrder,
  setTrackedWindowId,
} from '../windows/store.js';
import { hasYouTubeVideoChanged, isYouTubeVideoPage } from '../youtube/urls.js';

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
    const urlChanged = hasYouTubeVideoChanged(previousTabRecord.url, tab.url);
    const nextStatus = getTabState(tab);
    const nextTabRecord = createRecordFromTab(tab, previousTabRecord, nextStatus, {
      urlChanged,
    });

    nextTabRecords[tab.id] = nextTabRecord;
  }

  if (!isSyncTokenCurrent(syncToken)) {
    return { ok: false, applied: false, reason: 'superseded', windowId: resolvedWindowId };
  }
  replaceTabsInWindowOrder(tabs);
  replaceAllTabRecords(nextTabRecords);
  recomputeSortState();
  return { ok: true, applied: true, windowId: queriedWindowId, syncToken };
}
