import { TAB_STATES } from '../shared/tab-states.js';
import { isFiniteNumber } from '../shared/guards.js';
import { createTabRecord } from './tab-record.js';
import { recomputeSortState } from './sort-state.js';
import { getCurrentTimeMs } from './window-store.js';
import { removeTabRecordFromStore } from './window-store-mutations.js';

function clearTabRemainingTime(record) {
  if (record?.videoDetails && record.videoDetails.remainingTime != null) {
    record.videoDetails.remainingTime = null;
  }
}

function markRemainingTimeStale(record) {
  record.isRemainingTimeStale = true;
}

function resetMediaReadiness(record, { mediaWaitStartedAt = null } = {}) {
  record.pageMediaReady = false;
  record.mediaWaitStartedAt = mediaWaitStartedAt;
}

function resetVideoIdentity(record) {
  record.isLiveNow = false;
  record.videoDetails = null;
  markRemainingTimeStale(record);
}

function markRecordMediaReady(record) {
  record.pageMediaReady = true;
  record.mediaWaitStartedAt = null;
}

function markRecordMediaUnavailable(record) {
  record.pageRuntimeReady = false;
  resetMediaReadiness(record);
  clearTabRemainingTime(record);
  markRemainingTimeStale(record);
}

function resetRecordForVideoChange(record, { runtimeReady = false, timestamp = null } = {}) {
  record.pageRuntimeReady = Boolean(runtimeReady);
  resetMediaReadiness(record, { mediaWaitStartedAt: timestamp });
  resetVideoIdentity(record);
}

export function markTabRecordMetricsUnavailable(record) {
  if (!record) return;

  markRecordMediaUnavailable(record);
}

function markTabRecordVideoChanged(record) {
  if (!record) return;

  resetRecordForVideoChange(record);
}

function markTabRecordRuntimeReadyAfterVideoChange(record, timestamp) {
  if (!record) return;

  resetRecordForVideoChange(record, { runtimeReady: true, timestamp });
}

export function markTabRecordReloading(record) {
  if (!record) return;
  const timestamp = getCurrentTimeMs();
  record.status = TAB_STATES.LOADING;
  record.loadingStartedAt = timestamp;
  record.unsuspendedTimestamp = timestamp;
  markTabRecordMetricsUnavailable(record);
}

export function createRecordFromTabSnapshot(
  tab,
  previousRecord = {},
  nextStatus,
  { urlChanged = false } = {},
) {
  const isUnsuspended = nextStatus === TAB_STATES.UNSUSPENDED;
  const statusChanged = previousRecord.status && previousRecord.status !== nextStatus;
  const timestamp = getCurrentTimeMs();

  const record = createTabRecord(tab.id, tab.windowId, {
    url: tab.url,
    index: tab.index,
    pinned: Boolean(tab.pinned),
    status: nextStatus,
    pageRuntimeReady:
      isUnsuspended && !urlChanged ? Boolean(previousRecord.pageRuntimeReady) : false,
    pageMediaReady:
      isUnsuspended && !urlChanged ? Boolean(previousRecord.pageMediaReady) : false,
    isLiveNow: urlChanged ? false : Boolean(previousRecord.isLiveNow),
    isActiveTab: Boolean(tab.active),
    isHidden: Boolean(tab.hidden),
    videoDetails: urlChanged ? null : previousRecord.videoDetails || null,
    loadingStartedAt: previousRecord.loadingStartedAt ?? null,
    unsuspendedTimestamp: previousRecord.unsuspendedTimestamp || null,
    transitionStartedAt: previousRecord.transitionStartedAt || null,
    mediaWaitStartedAt: urlChanged ? null : previousRecord.mediaWaitStartedAt ?? null,
    isRemainingTimeStale:
      !isUnsuspended ||
      Boolean(previousRecord.isRemainingTimeStale) ||
      statusChanged ||
      urlChanged,
  });

  if (nextStatus === TAB_STATES.LOADING) {
    if (previousRecord.status !== TAB_STATES.LOADING || typeof record.loadingStartedAt !== 'number') {
      record.loadingStartedAt = timestamp;
    }
  } else {
    record.loadingStartedAt = null;
  }

  if (
    (previousRecord.status === TAB_STATES.SUSPENDED ||
      previousRecord.status === TAB_STATES.LOADING) &&
    nextStatus === TAB_STATES.UNSUSPENDED
  ) {
    record.unsuspendedTimestamp = timestamp;
    record.transitionStartedAt = timestamp;
  } else if (urlChanged) {
    record.transitionStartedAt = timestamp;
  }

  if ((!isUnsuspended || urlChanged) && record.videoDetails) {
    clearTabRemainingTime(record);
  }

  return record;
}

export function applyPageRuntimeReady(record, { urlChanged = false, url = null } = {}) {
  if (!record) return;
  const timestamp = getCurrentTimeMs();
  if (urlChanged) {
    markTabRecordRuntimeReadyAfterVideoChange(record, timestamp);
  }
  if (url) record.url = url;
  record.pageRuntimeReady = true;
  if (!record.pageMediaReady && typeof record.mediaWaitStartedAt !== 'number') {
    record.mediaWaitStartedAt = timestamp;
  }
}

export function applyPageMediaReady(record) {
  if (!record) return;
  markRecordMediaReady(record);
}

export function applyPageVideoDetails(record, details = {}, { urlChanged = false } = {}) {
  if (!record) return;
  if (urlChanged) markTabRecordVideoChanged(record);
  if (details.url) record.url = details.url;
  record.videoDetails = record.videoDetails || {};
  if (details.title) record.videoDetails.title = details.title;
  if (typeof details.isLive === 'boolean') record.isLiveNow = details.isLive;

  if (isFiniteNumber(details.lengthSeconds)) {
    record.videoDetails.lengthSeconds = details.lengthSeconds;
    if (!record.isLiveNow && record.videoDetails.remainingTime == null) {
      record.videoDetails.remainingTime = details.lengthSeconds;
      record.isRemainingTimeStale = true;
    }
  }

  if (record.isLiveNow) {
    clearTabRemainingTime(record);
    record.isRemainingTimeStale = false;
    record.mediaWaitStartedAt = null;
  }
}

export function applyPlaybackMetricUpdate(record, playbackUpdate, currentTabUrl) {
  if (!record || !playbackUpdate) return;

  record.pageRuntimeReady = playbackUpdate.pageRuntimeReady;
  if (playbackUpdate.pageMediaReady) {
    markRecordMediaReady(record);
  } else {
    resetMediaReadiness(record, { mediaWaitStartedAt: record.mediaWaitStartedAt });
    if (record.pageRuntimeReady && typeof record.mediaWaitStartedAt !== 'number') {
      record.mediaWaitStartedAt = getCurrentTimeMs();
    }
  }
  record.videoDetails = record.videoDetails || {};

  if (playbackUpdate.nextTitle || playbackUpdate.nextUrl || currentTabUrl) {
    if (playbackUpdate.nextTitle) record.videoDetails.title = playbackUpdate.nextTitle;
    record.url = playbackUpdate.nextUrl || currentTabUrl;
  }

  record.isLiveNow = Boolean(playbackUpdate.isLiveNow);
  record.videoDetails.lengthSeconds = playbackUpdate.resolvedLengthSeconds;
  record.videoDetails.remainingTime = playbackUpdate.remainingTime;
  record.isRemainingTimeStale = playbackUpdate.isRemainingTimeStale;
}

export function removeTabRecord(tabId) {
  if (!removeTabRecordFromStore(tabId)) return false;
  recomputeSortState();
  return true;
}
