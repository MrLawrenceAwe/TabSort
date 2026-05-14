import { TAB_STATES } from '../shared/tab-states.js';
import { isFiniteNumber } from '../shared/guards.js';
import { createTabRecord } from './tab-record.js';
import { getCurrentTimeMs } from './window-store.js';

export function clearTabRemainingTime(record) {
  if (record?.videoDetails && record.videoDetails.remainingTime != null) {
    record.videoDetails.remainingTime = null;
  }
}

export function markRemainingTimeStale(record) {
  record.remainingTimeStale = true;
}

export function resetVideoReadiness(record, { videoWaitStartedAt = null } = {}) {
  record.mediaElementObserved = false;
  record.videoWaitStartedAt = videoWaitStartedAt;
}

function resetVideoIdentity(record) {
  record.isLiveNow = false;
  record.videoDetails = null;
  markRemainingTimeStale(record);
}

export function markRecordVideoElementReady(record) {
  record.mediaElementObserved = true;
  record.videoWaitStartedAt = null;
}

function markRecordVideoUnavailable(record) {
  record.contentScriptReported = false;
  resetVideoReadiness(record);
  clearTabRemainingTime(record);
  markRemainingTimeStale(record);
}

function resetRecordForVideoChange(record, { contentScriptReported = false, timestamp = null } = {}) {
  record.contentScriptReported = Boolean(contentScriptReported);
  resetVideoReadiness(record, { videoWaitStartedAt: timestamp });
  resetVideoIdentity(record);
}

export function markTabRecordMetricsUnavailable(record) {
  if (!record) return;

  markRecordVideoUnavailable(record);
}

function markTabRecordVideoChanged(record) {
  if (!record) return;

  resetRecordForVideoChange(record);
}

function markTabRecordContentScriptReadyAfterVideoChange(record, timestamp) {
  if (!record) return;

  resetRecordForVideoChange(record, { contentScriptReported: true, timestamp });
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
    contentScriptReported:
      isUnsuspended && !urlChanged ? Boolean(previousRecord.contentScriptReported) : false,
    mediaElementObserved:
      isUnsuspended && !urlChanged ? Boolean(previousRecord.mediaElementObserved) : false,
    isLiveNow: urlChanged ? false : Boolean(previousRecord.isLiveNow),
    isActiveTab: Boolean(tab.active),
    isHidden: Boolean(tab.hidden),
    videoDetails: urlChanged ? null : previousRecord.videoDetails || null,
    loadingStartedAt: previousRecord.loadingStartedAt ?? null,
    unsuspendedTimestamp: previousRecord.unsuspendedTimestamp || null,
    transitionStartedAt: previousRecord.transitionStartedAt || null,
    videoWaitStartedAt: urlChanged ? null : previousRecord.videoWaitStartedAt ?? null,
    remainingTimeStale:
      !isUnsuspended ||
      Boolean(previousRecord.remainingTimeStale) ||
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

export function applyContentScriptReady(record, { urlChanged = false, url = null } = {}) {
  if (!record) return;
  const timestamp = getCurrentTimeMs();
  if (urlChanged) {
    markTabRecordContentScriptReadyAfterVideoChange(record, timestamp);
  }
  if (url) record.url = url;
  record.contentScriptReported = true;
  if (!record.mediaElementObserved && typeof record.videoWaitStartedAt !== 'number') {
    record.videoWaitStartedAt = timestamp;
  }
}

export function applyVideoElementReady(record) {
  if (!record) return;
  markRecordVideoElementReady(record);
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
      record.remainingTimeStale = true;
    }
  }

  if (record.isLiveNow) {
    clearTabRemainingTime(record);
    record.remainingTimeStale = false;
    record.videoWaitStartedAt = null;
  }
}
