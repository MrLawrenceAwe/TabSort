import { TAB_STATES } from '../shared/tab-states.js';
import { isFiniteNumber } from '../shared/guards.js';
import { getCurrentTimeMs } from './tracked-window-store.js';

export function clearRemainingTime(record) {
  if (record?.videoDetails && record.videoDetails.remainingTime != null) {
    record.videoDetails.remainingTime = null;
  }
}

export function markRemainingTimeAsStale(record) {
  record.remainingTimeStale = true;
}

export function resetVideoReadiness(record, { waitingForVideoSince = null } = {}) {
  record.videoElementReady = false;
  record.waitingForVideoSince = waitingForVideoSince;
}

function clearVideoIdentity(record) {
  record.isLiveNow = false;
  record.videoDetails = null;
  markRemainingTimeAsStale(record);
}

export function markVideoElementReady(record) {
  record.videoElementReady = true;
  record.waitingForVideoSince = null;
}

export function applyVideoMetricsUnavailable(record) {
  if (!record) return;
  record.pageRuntimeReady = false;
  resetVideoReadiness(record);
  clearRemainingTime(record);
  markRemainingTimeAsStale(record);
}

function applyVideoIdentityChanged(record, { pageRuntimeReady = false, timestamp = null } = {}) {
  record.pageRuntimeReady = Boolean(pageRuntimeReady);
  resetVideoReadiness(record, { waitingForVideoSince: timestamp });
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

export function applyContentScriptReady(record, { urlChanged = false, url = null } = {}) {
  if (!record) return;
  const timestamp = getCurrentTimeMs();
  if (urlChanged) {
    applyVideoIdentityChanged(record, { pageRuntimeReady: true, timestamp });
  }
  if (url) record.url = url;
  record.pageRuntimeReady = true;
  if (!record.videoElementReady && typeof record.waitingForVideoSince !== 'number') {
    record.waitingForVideoSince = timestamp;
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
    record.waitingForVideoSince = null;
  }
}
