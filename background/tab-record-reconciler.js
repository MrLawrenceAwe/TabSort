import { isValidWindowId } from '../shared/guards.js';
import { getTabState, listWindowTabs } from './chrome-api.js';
import { recomputeSortState } from './sort-state.js';
import { createRecordFromTabSnapshot } from './tab-record-factory.js';
import {
  getTabRecordsById,
  getTrackedWindowId,
  isSyncTokenCurrent,
  nextSyncToken,
  replaceAllTabRecords,
  setTrackedWindowId,
} from './tracked-window-store.js';
import { hasYoutubeVideoIdentityChanged, isWatchOrShortsPage } from './youtube-url-utils.js';

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
    if (!isWatchOrShortsPage(tab.url)) continue;

    const previousTabRecord = previousTabRecords[tab.id] || {};
    const urlChanged = hasYoutubeVideoIdentityChanged(previousTabRecord.url, tab.url);
    const nextStatus = getTabState(tab);
    const nextTabRecord = createRecordFromTabSnapshot(tab, previousTabRecord, nextStatus, {
      urlChanged,
    });

    nextTabRecords[tab.id] = nextTabRecord;
  }

  if (!isSyncTokenCurrent(syncToken)) return;
  replaceAllTabRecords(nextTabRecords);
  recomputeSortState();
}
