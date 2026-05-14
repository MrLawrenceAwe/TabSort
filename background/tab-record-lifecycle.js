import { TAB_STATES } from '../shared/tab-states.js';
import { isFiniteNumber } from '../shared/guards.js';
import { createTabRecord } from './tab-record.js';
import { getCurrentTimeMs } from './window-store.js';

export function clearRemainingTime(record) {
  if (record?.videoDetails && record.videoDetails.remainingTime != null) {
    record.videoDetails.remainingTime = null;
  }
}

export function markRemainingTimeAsStale(record) {
  record.remainingTimeStale = true;
}

export function resetMediaReadiness(record, { videoWaitStartedAt = null } = {}) {
  record.mediaElementObserved = false;
  record.videoWaitStartedAt = videoWaitStartedAt;
}

function clearVideoIdentity(record) {
  record.isLiveNow = false;
  record.videoDetails = null;
  markRemainingTimeAsStale(record);
}

export function markMediaElementObserved(record) {
  record.mediaElementObserved = true;
  record.videoWaitStartedAt = null;
}

export function applyVideoMetricsUnavailable(record) {
  if (!record) return;
  record.contentScriptReported = false;
  resetMediaReadiness(record);
  clearRemainingTime(record);
  markRemainingTimeAsStale(record);
}

function applyVideoIdentityChanged(record, { contentScriptReported = false, timestamp = null } = {}) {
  record.contentScriptReported = Boolean(contentScriptReported);
  resetMediaReadiness(record, { videoWaitStartedAt: timestamp });
  clearVideoIdentity(record);
}

export function applyTabReloadStarted(record) {
  if (!record) return;
  const timestamp = getCurrentTimeMs();
  record.status = TAB_STATES.LOADING;
  record.loadingStartedAt = timestamp;
  record.unsuspendedTimestamp = timestamp;
  applyVideoMetricsUnavailable(record);
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
    clearRemainingTime(record);
  }

  return record;
}

export function applyContentScriptReady(record, { urlChanged = false, url = null } = {}) {
  if (!record) return;
  const timestamp = getCurrentTimeMs();
  if (urlChanged) {
    applyVideoIdentityChanged(record, { contentScriptReported: true, timestamp });
  }
  if (url) record.url = url;
  record.contentScriptReported = true;
  if (!record.mediaElementObserved && typeof record.videoWaitStartedAt !== 'number') {
    record.videoWaitStartedAt = timestamp;
  }
}

export function applyVideoDetailsFromPage(record, details = {}, { urlChanged = false } = {}) {
  if (!record) return;
  if (urlChanged) applyVideoIdentityChanged(record);
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
    clearRemainingTime(record);
    record.remainingTimeStale = false;
    record.videoWaitStartedAt = null;
  }
}
