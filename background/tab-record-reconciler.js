import { isValidWindowId } from '../shared/guards.js';
import { getTabState, listWindowTabs } from './chrome-tabs.js';
import { recomputeSortState } from './sort-state.js';
import { createRecordFromTabSnapshot } from './tab-record-mutations.js';
import { trackedWindowState } from './window-state.js';
import {
  beginSync,
  isSyncCurrent,
  replaceTabRecords,
  setTrackedWindowId,
} from './window-state.js';
import { hasYoutubeVideoIdentityChanged, isWatchOrShortsPage } from './youtube-url-utils.js';

export async function reconcileWindowTabRecords(windowId, options = {}) {
  const syncToken = beginSync();
  const resolvedWindowId = setTrackedWindowId(windowId, options);
  const tabs = await listWindowTabs(resolvedWindowId);
  if (!isSyncCurrent(syncToken)) return;
  if (!Array.isArray(tabs)) return;
  if (resolvedWindowId == null && tabs.length === 0) return;

  if (
    isValidWindowId(resolvedWindowId) &&
    isValidWindowId(trackedWindowState.windowId) &&
    resolvedWindowId !== trackedWindowState.windowId
  ) {
    return;
  }

  const previousTabRecords = trackedWindowState.tabRecordsById;
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

  if (!isSyncCurrent(syncToken)) return;
  replaceTabRecords(nextTabRecords);
  recomputeSortState();
}
