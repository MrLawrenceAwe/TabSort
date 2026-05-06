import { TAB_STATES } from '../shared/tab-states.js';
import { isValidWindowId } from '../shared/guards.js';
import { getTabState, listWindowTabs } from './chrome-tabs.js';
import { recomputeSortState } from './sort-state.js';
import { createTabRecord } from './tab-record.js';
import {
  beginSync,
  isSyncCurrent,
  trackedWindowState,
  getCurrentTimeMs,
  replaceTabRecords,
  setWindowId,
} from './tracked-window-store.js';
import { hasYoutubeVideoIdentityChanged, isWatchOrShortsPage } from './youtube-url-utils.js';

function syncLoadingTimestamp(record, previousStatus, nextStatus) {
  if (nextStatus === TAB_STATES.LOADING) {
    if (previousStatus !== TAB_STATES.LOADING || typeof record.loadingStartedAt !== 'number') {
      record.loadingStartedAt = getCurrentTimeMs();
    }
    return;
  }

  record.loadingStartedAt = null;
}

function recordUnsuspendedTransition(record, previousStatus, nextStatus) {
  if (
    (previousStatus === TAB_STATES.SUSPENDED || previousStatus === TAB_STATES.LOADING) &&
    nextStatus === TAB_STATES.UNSUSPENDED
  ) {
    record.unsuspendedTimestamp = getCurrentTimeMs();
  }
}

export async function syncWindowTabRecords(windowId, options = {}) {
  const syncToken = beginSync();
  const resolvedWindowId = setWindowId(windowId, options);
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
    const previousPageRuntimeReady = Boolean(previousTabRecord.pageRuntimeReady);
    const statusChanged = previousTabRecord.status && previousTabRecord.status !== nextStatus;
    const isUnsuspended = nextStatus === TAB_STATES.UNSUSPENDED;

    const nextTabRecord = createTabRecord(tab.id, tab.windowId, {
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
      isLiveNow: urlChanged ? false : Boolean(previousTabRecord.isLiveNow),
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
    });

    syncLoadingTimestamp(nextTabRecord, previousTabRecord.status, nextStatus);
    recordUnsuspendedTransition(nextTabRecord, previousTabRecord.status, nextStatus);

    if (
      (!isUnsuspended || urlChanged) &&
      nextTabRecord.videoDetails &&
      nextTabRecord.videoDetails.remainingTime != null
    ) {
      nextTabRecord.videoDetails.remainingTime = null;
    }

    nextTabRecords[tab.id] = nextTabRecord;
  }

  if (!isSyncCurrent(syncToken)) return;
  replaceTabRecords(nextTabRecords);
  recomputeSortState();
}
