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
  setTrackedWindowId,
} from '../windows/store.js';
import { hasYouTubeVideoChanged, isYouTubeVideoPage } from '../youtube/urls.js';

function resolveWindowIdForQuery(windowId, { force = false } = {}) {
  const currentWindowId = getTrackedWindowId();
  if (isValidWindowId(windowId) && (force || currentWindowId == null)) return windowId;
  if (force && windowId == null) return null;
  return currentWindowId;
}

export async function reconcileWindowTabRecords(windowId, options = {}) {
  const syncToken = nextSyncToken();
  const resolvedWindowId = resolveWindowIdForQuery(windowId, options);
  const tabs = await listWindowTabs(resolvedWindowId);
  if (!isSyncTokenCurrent(syncToken)) return;
  if (!Array.isArray(tabs)) return;
  if (resolvedWindowId == null && tabs.length === 0) return;
  setTrackedWindowId(resolvedWindowId, options);

  if (
    isValidWindowId(resolvedWindowId) &&
    isValidWindowId(getTrackedWindowId()) &&
    resolvedWindowId !== getTrackedWindowId()
  ) {
    return;
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

  if (!isSyncTokenCurrent(syncToken)) return;
  replaceAllTabRecords(nextTabRecords);
  recomputeSortState();
}
