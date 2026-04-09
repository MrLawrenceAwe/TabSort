import { TAB_STATES } from '../shared/constants.js';
import { isValidWindowId } from '../shared/utils.js';
import { getTabState, listWindowTabs } from './chrome-tabs.js';
import { recomputeSortState } from './sort-state.js';
import { now, setTrackedWindowId, trackingState } from './tracking-state.js';
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

export async function syncTrackedTabsForWindow(windowId, options = {}) {
  const syncToken = (trackingState.syncToken += 1);
  const resolvedWindowId = setTrackedWindowId(windowId, options);
  const tabs = await listWindowTabs(resolvedWindowId);
  if (syncToken !== trackingState.syncToken) return;
  if (!Array.isArray(tabs)) return;
  if (resolvedWindowId == null && tabs.length === 0) return;

  if (
    isValidWindowId(resolvedWindowId) &&
    isValidWindowId(trackingState.trackedWindowId) &&
    resolvedWindowId !== trackingState.trackedWindowId
  ) {
    return;
  }

  const previousRecords = trackingState.trackedTabsById;
  const nextRecords = {};

  for (const tab of tabs) {
    if (!isWatchOrShortsPage(tab.url)) continue;

    const previousRecord = previousRecords[tab.id] || {};
    const urlChanged = hasYoutubeVideoIdentityChanged(previousRecord.url, tab.url);
    const nextStatus = getTabState(tab);
    const previousPageRuntimeReady = Boolean(previousRecord.pageRuntimeReady);
    const statusChanged = previousRecord.status && previousRecord.status !== nextStatus;
    const isUnsuspended = nextStatus === TAB_STATES.UNSUSPENDED;

    const nextRecord = {
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
          ? Boolean(previousRecord.pageMediaReady)
          : false,
      isLiveStream: urlChanged ? false : Boolean(previousRecord.isLiveStream),
      isActiveTab: Boolean(tab.active),
      isHidden: Boolean(tab.hidden),
      videoDetails: urlChanged ? null : previousRecord.videoDetails || null,
      loadingStartedAt: previousRecord.loadingStartedAt ?? null,
      unsuspendedTimestamp: previousRecord.unsuspendedTimestamp || null,
      isRemainingTimeStale:
        !isUnsuspended || Boolean(previousRecord.isRemainingTimeStale) || statusChanged || urlChanged,
    };

    markLoadingStartedAt(nextRecord, previousRecord.status, nextStatus);
    markUnsuspendedAt(nextRecord, previousRecord.status, nextStatus);

    if (
      (!isUnsuspended || urlChanged) &&
      nextRecord.videoDetails &&
      nextRecord.videoDetails.remainingTime != null
    ) {
      nextRecord.videoDetails.remainingTime = null;
    }

    nextRecords[tab.id] = nextRecord;
  }

  if (syncToken !== trackingState.syncToken) return;
  trackingState.trackedTabsById = nextRecords;
  recomputeSortState();
}

export const rebuildTrackedTabsForWindow = syncTrackedTabsForWindow;
