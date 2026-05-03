import { TAB_STATES } from '../shared/constants.js';
import { isValidWindowId } from '../shared/guards.js';
import { getTabState, listWindowTabs } from './chrome-tabs.js';
import { recomputeSortState } from './sort-state.js';
import {
  beginManagedSync,
  isManagedSyncCurrent,
  managedState,
  now,
  replaceTabRecords,
  setManagedWindowId,
} from './managed-state.js';
import { hasYoutubeVideoIdentityChanged, isWatchOrShortsPage } from './youtube-url-utils.js';

function markLoadingStartedAt(record, previousStatus, nextStatus) {
  if (nextStatus === TAB_STATES.LOADING) {
    if (previousStatus !== TAB_STATES.LOADING || typeof record.loadingStartedAt !== 'number') {
      record.loadingStartedAt = now();
    }
    return;
  }

  record.loadingStartedAt = null;
}

function markUnsuspendedAt(record, previousStatus, nextStatus) {
  if (
    (previousStatus === TAB_STATES.SUSPENDED || previousStatus === TAB_STATES.LOADING) &&
    nextStatus === TAB_STATES.UNSUSPENDED
  ) {
    record.unsuspendedTimestamp = now();
  }
}

export async function syncWindowTabRecords(windowId, options = {}) {
  const syncToken = beginManagedSync();
  const resolvedWindowId = setManagedWindowId(windowId, options);
  const tabs = await listWindowTabs(resolvedWindowId);
  if (!isManagedSyncCurrent(syncToken)) return;
  if (!Array.isArray(tabs)) return;
  if (resolvedWindowId == null && tabs.length === 0) return;

  if (
    isValidWindowId(resolvedWindowId) &&
    isValidWindowId(managedState.managedWindowId) &&
    resolvedWindowId !== managedState.managedWindowId
  ) {
    return;
  }

  const previousTabRecords = managedState.tabRecordsById;
  const nextTabRecords = {};

  for (const tab of tabs) {
    if (!isWatchOrShortsPage(tab.url)) continue;

    const previousTabRecord = previousTabRecords[tab.id] || {};
    const urlChanged = hasYoutubeVideoIdentityChanged(previousTabRecord.url, tab.url);
    const nextStatus = getTabState(tab);
    const previousPageRuntimeReady = Boolean(previousTabRecord.pageRuntimeReady);
    const statusChanged = previousTabRecord.status && previousTabRecord.status !== nextStatus;
    const isUnsuspended = nextStatus === TAB_STATES.UNSUSPENDED;

    const nextTabRecord = {
      id: tab.id,
      windowId: tab.windowId,
      url: tab.url,
      index: tab.index,
      pinned: Boolean(tab.pinned),
      status: nextStatus,
      pageRuntimeReady:
        nextStatus === TAB_STATES.UNSUSPENDED && !urlChanged ? previousPageRuntimeReady : false,
      pageMediaReady:
        nextStatus === TAB_STATES.UNSUSPENDED && !urlChanged
          ? Boolean(previousTabRecord.pageMediaReady)
          : false,
      isLiveStream: urlChanged ? false : Boolean(previousTabRecord.isLiveStream),
      isActiveTab: Boolean(tab.active),
      isHidden: Boolean(tab.hidden),
      videoDetails: urlChanged ? null : previousTabRecord.videoDetails || null,
      loadingStartedAt: previousTabRecord.loadingStartedAt ?? null,
      unsuspendedTimestamp: previousTabRecord.unsuspendedTimestamp || null,
      isRemainingTimeStale:
        !isUnsuspended ||
        Boolean(previousTabRecord.isRemainingTimeStale) ||
        statusChanged ||
        urlChanged,
    };

    markLoadingStartedAt(nextTabRecord, previousTabRecord.status, nextStatus);
    markUnsuspendedAt(nextTabRecord, previousTabRecord.status, nextStatus);

    if (
      (!isUnsuspended || urlChanged) &&
      nextTabRecord.videoDetails &&
      nextTabRecord.videoDetails.remainingTime != null
    ) {
      nextTabRecord.videoDetails.remainingTime = null;
    }

    nextTabRecords[tab.id] = nextTabRecord;
  }

  if (!isManagedSyncCurrent(syncToken)) return;
  replaceTabRecords(nextTabRecords);
  recomputeSortState();
}
