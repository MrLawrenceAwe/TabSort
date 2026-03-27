import { TAB_STATES } from '../shared/constants.js';
import { isFiniteNumber, isValidWindowId } from '../shared/guards.js';
import { backgroundStore, updateTrackedWindowId } from './store.js';
import { recomputeSortState } from './sort-state.js';
import {
  getTab,
  getTabState,
  listWindowTabs,
  sendMessageToTab,
} from './chrome-tabs.js';
import { updateLoadStart, updateUnsuspendTime } from './tab-state.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';

export async function syncTrackedWindowTabs(windowId, options = {}) {
  const syncToken = (backgroundStore.syncToken += 1);
  const resolvedWindowId = updateTrackedWindowId(windowId, options);
  const tabs = await listWindowTabs(resolvedWindowId);
  if (syncToken !== backgroundStore.syncToken) return;
  if (resolvedWindowId == null && tabs.length === 0) return;

  if (
    isValidWindowId(resolvedWindowId) &&
    isValidWindowId(backgroundStore.trackedWindowId) &&
    resolvedWindowId !== backgroundStore.trackedWindowId
  ) {
    return;
  }

  const previousRecords = backgroundStore.trackedTabsById;
  const nextRecords = {};

  for (const tab of tabs) {
    if (!isWatchOrShortsPage(tab.url)) continue;

    const previousRecord = previousRecords[tab.id] || {};
    const urlChanged = Boolean(previousRecord.url) && Boolean(tab.url) && previousRecord.url !== tab.url;
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
      pageRuntimeReady: nextStatus === TAB_STATES.UNSUSPENDED ? previousPageRuntimeReady : false,
      isLiveStream: urlChanged ? false : Boolean(previousRecord.isLiveStream),
      isActiveTab: Boolean(tab.active),
      isHidden: Boolean(tab.hidden),
      videoDetails: urlChanged ? null : previousRecord.videoDetails || null,
      loadingStartedAt: previousRecord.loadingStartedAt ?? null,
      unsuspendedTimestamp: previousRecord.unsuspendedTimestamp || null,
      isRemainingTimeStale:
        !isUnsuspended || Boolean(previousRecord.isRemainingTimeStale) || statusChanged || urlChanged,
    };

    updateLoadStart(nextRecord, previousRecord.status, nextStatus);
    updateUnsuspendTime(nextRecord, previousRecord.status, nextStatus);

    if (
      (!isUnsuspended || urlChanged) &&
      nextRecord.videoDetails &&
      nextRecord.videoDetails.remainingTime != null
    ) {
      nextRecord.videoDetails.remainingTime = null;
    }

    nextRecords[tab.id] = nextRecord;
  }

  if (syncToken !== backgroundStore.syncToken) return;
  backgroundStore.trackedTabsById = nextRecords;
  recomputeSortState();
}

export async function refreshTrackedTab(tabId) {
  try {
    let record = backgroundStore.trackedTabsById[tabId];
    if (!record || record.status !== TAB_STATES.UNSUSPENDED) return;

    const tab = await getTab(tabId);
    record = backgroundStore.trackedTabsById[tabId];
    if (!record || record.status !== TAB_STATES.UNSUSPENDED) return;
    if (backgroundStore.trackedWindowId != null && tab.windowId !== backgroundStore.trackedWindowId) return;
    if (tab.windowId != null) {
      record.windowId = tab.windowId;
      updateTrackedWindowId(tab.windowId);
    }
    record.isActiveTab = Boolean(tab.active);
    record.isHidden = Boolean(tab.hidden);
    if (!isWatchOrShortsPage(tab.url)) return;

    const result = await sendMessageToTab(tabId, { type: 'collectVideoMetrics' });
    record = backgroundStore.trackedTabsById[tabId];
    if (!record || record.status !== TAB_STATES.UNSUSPENDED) return;
    if (!result || result.ok !== true) {
      record.pageRuntimeReady = false;
      if (record.videoDetails && record.videoDetails.remainingTime != null) {
        record.videoDetails.remainingTime = null;
      }
      record.isRemainingTimeStale = true;
      recomputeSortState();
      return;
    }

    const metricsPayload = result.data;
    if (!metricsPayload || typeof metricsPayload !== 'object') return;
    record.pageRuntimeReady = true;
    record.videoDetails = record.videoDetails || {};

    if (metricsPayload.title || metricsPayload.url) {
      if (metricsPayload.title) record.videoDetails.title = metricsPayload.title;
      if (!record.url && metricsPayload.url) record.url = metricsPayload.url;
    }

    if (metricsPayload.isLive === true) record.isLiveStream = true;
    if (metricsPayload.isLive === false) record.isLiveStream = false;

    const videoLengthSeconds = Number(metricsPayload.lengthSeconds ?? metricsPayload.duration ?? NaN);
    const currentTimeSeconds = Number(metricsPayload.currentTime ?? NaN);
    const rate = Number(metricsPayload.playbackRate ?? 1);

    if (record.isLiveStream) {
      record.videoDetails.lengthSeconds = isFiniteNumber(videoLengthSeconds) ? videoLengthSeconds : null;
      record.videoDetails.remainingTime = null;
      record.isRemainingTimeStale = false;
      recomputeSortState();
      return;
    }

    if (isFiniteNumber(videoLengthSeconds)) {
      record.videoDetails.lengthSeconds = videoLengthSeconds;
    } else {
      record.videoDetails.lengthSeconds = null;
      record.videoDetails.remainingTime = null;
      record.isRemainingTimeStale = false;
      recomputeSortState();
      return;
    }

    if (isFiniteNumber(currentTimeSeconds)) {
      const remainingSeconds = Math.max(
        0,
        (videoLengthSeconds - currentTimeSeconds) / (isFiniteNumber(rate) && rate > 0 ? rate : 1),
      );
      record.videoDetails.remainingTime = remainingSeconds;
      record.isRemainingTimeStale = false;
    } else {
      record.videoDetails.remainingTime = videoLengthSeconds;
      record.isRemainingTimeStale = true;
    }

    recomputeSortState();
  } catch (_) {}
}
