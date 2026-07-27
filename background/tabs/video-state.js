import { TAB_LOAD_STATES } from '../../shared/tabs/load-states.js';
import { isFiniteNumber } from '../../shared/guards.js';
import { nowMs } from '../../shared/time.js';

export function clearRemainingTime(record) {
  if (record?.videoDetails && record.videoDetails.remainingTime != null) {
    record.videoDetails.remainingTime = null;
  }
}

export function markRemainingTimeAsStale(record) {
  record.remainingTimeStale = true;
}

export function resetPlaybackReadiness(record, { metricsWaitStartedAt = null } = {}) {
  record.playbackMetricsReady = false;
  record.metricsWaitStartedAt = metricsWaitStartedAt;
}

function clearVideoIdentity(record) {
  record.isLive = false;
  record.videoDetails = null;
  markRemainingTimeAsStale(record);
}

export function markPlaybackMetricsReady(record) {
  record.playbackMetricsReady = true;
  record.metricsWaitStartedAt = null;
}

export function applyVideoMetricsUnavailable(record) {
  if (!record) return;
  record.contentScriptReady = false;
  resetPlaybackReadiness(record);
  clearRemainingTime(record);
  markRemainingTimeAsStale(record);
}

function applyVideoIdentityChanged(record, { contentScriptReady = false, timestamp = null } = {}) {
  record.contentScriptReady = Boolean(contentScriptReady);
  resetPlaybackReadiness(record, { metricsWaitStartedAt: timestamp });
  clearVideoIdentity(record);
}

export function applyTabReloadStarted(record) {
  if (!record) return;
  const timestamp = nowMs();
  record.loadState = TAB_LOAD_STATES.LOADING;
  record.loadingStartedAt = timestamp;
  record.unsuspendedTimestamp = timestamp;
  applyVideoMetricsUnavailable(record);
}

export function applyContentScriptReady(record, { urlChanged = false, url = null } = {}) {
  if (!record) return;
  const timestamp = nowMs();
  if (urlChanged) {
    applyVideoIdentityChanged(record, { contentScriptReady: true, timestamp });
  }
  if (url) record.url = url;
  record.contentScriptReady = true;
  if (!record.playbackMetricsReady && typeof record.metricsWaitStartedAt !== 'number') {
    record.metricsWaitStartedAt = timestamp;
  }
}

export function applyVideoDetailsFromPage(record, details = {}, { urlChanged = false } = {}) {
  if (!record) return;
  if (urlChanged) applyVideoIdentityChanged(record);
  if (details.url) record.url = details.url;
  record.videoDetails = record.videoDetails || {};
  if (details.title) record.videoDetails.title = details.title;
  if (typeof details.isLive === 'boolean') record.isLive = details.isLive;

  if (isFiniteNumber(details.lengthSeconds)) {
    record.videoDetails.lengthSeconds = details.lengthSeconds;
    if (!record.isLive && record.videoDetails.remainingTime == null) {
      record.videoDetails.remainingTime = details.lengthSeconds;
      record.remainingTimeStale = true;
    }
  }

  if (record.isLive) {
    clearRemainingTime(record);
    record.remainingTimeStale = false;
    record.metricsWaitStartedAt = null;
  }
}
