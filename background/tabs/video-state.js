import { TAB_LOAD_STATES } from '../../shared/tabs/load-states.js';
import { isFiniteNumber } from '../../shared/guards.js';

export function clearRemainingTime(record) {
  if (record?.videoDetails && record.videoDetails.remainingSeconds != null) {
    record.videoDetails.remainingSeconds = null;
  }
}

export function markRemainingTimeAsStale(record) {
  record.remainingSecondsStale = true;
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
  record.hasAutoPreparedTime = false;
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
  const timestamp = Date.now();
  record.loadState = TAB_LOAD_STATES.LOADING;
  record.loadingStartedAt = timestamp;
  record.loadedAt = null;
  applyVideoMetricsUnavailable(record);
}

export function applyContentScriptReady(record, { videoChanged = false, url = null } = {}) {
  if (!record) return;
  const timestamp = Date.now();
  if (videoChanged) {
    applyVideoIdentityChanged(record, { contentScriptReady: true, timestamp });
  }
  if (url) record.url = url;
  record.contentScriptReady = true;
  if (!record.playbackMetricsReady && typeof record.metricsWaitStartedAt !== 'number') {
    record.metricsWaitStartedAt = timestamp;
  }
}

export function applyVideoDetailsFromPage(record, details = {}, { videoChanged = false } = {}) {
  if (!record) return;
  if (videoChanged) applyVideoIdentityChanged(record);
  if (details.url) record.url = details.url;
  record.videoDetails = record.videoDetails || {};
  if (details.title) record.videoDetails.title = details.title;
  const wasLive = record.isLive;
  if (typeof details.isLive === 'boolean') {
    record.isLive = details.isLive;
  }
  if (wasLive && !record.isLive) {
    resetPlaybackReadiness(record, { metricsWaitStartedAt: Date.now() });
    clearRemainingTime(record);
    markRemainingTimeAsStale(record);
  }

  if (isFiniteNumber(details.lengthSeconds)) {
    record.videoDetails.lengthSeconds = details.lengthSeconds;
    if (!record.isLive && record.videoDetails.remainingSeconds == null) {
      record.videoDetails.remainingSeconds = details.lengthSeconds;
      record.remainingSecondsStale = true;
    }
  }

  if (record.isLive) {
    clearRemainingTime(record);
    record.remainingSecondsStale = false;
    record.metricsWaitStartedAt = null;
  }
}
