import {
  MEDIA_DURATION_SYNC_TOLERANCE_SECONDS,
  isFiniteNumber,
  toFiniteNumber,
  toPositiveFiniteNumber,
} from '../shared/guards.js';
import { getYoutubeVideoIdentity } from './youtube-url-utils.js';

function areEquivalentVideoUrls(leftUrl, rightUrl) {
  const leftIdentity = getYoutubeVideoIdentity(leftUrl);
  const rightIdentity = getYoutubeVideoIdentity(rightUrl);

  if (leftIdentity && rightIdentity) {
    return leftIdentity === rightIdentity;
  }

  return Boolean(leftUrl) && Boolean(rightUrl) && leftUrl === rightUrl;
}

function shouldIgnoreStaleMetricsPayload({ payloadUrl, requestedUrl, currentTabUrl }) {
  if (payloadUrl && currentTabUrl && !areEquivalentVideoUrls(payloadUrl, currentTabUrl)) {
    return true;
  }

  return (
    !payloadUrl &&
    requestedUrl &&
    currentTabUrl &&
    !areEquivalentVideoUrls(requestedUrl, currentTabUrl)
  );
}

function resolveVideoLengthSeconds(metricsPayload, record) {
  const pageLengthSeconds = toPositiveFiniteNumber(metricsPayload.lengthSeconds);
  if (pageLengthSeconds != null) {
    return pageLengthSeconds;
  }

  const recordedLengthSeconds = toPositiveFiniteNumber(record?.videoDetails?.lengthSeconds);
  if (recordedLengthSeconds != null) {
    return recordedLengthSeconds;
  }

  return toPositiveFiniteNumber(metricsPayload.duration) ?? NaN;
}

function hasMediaDurationMismatch(metricsPayload, record, resolvedLengthSeconds) {
  const videoDurationSeconds = toFiniteNumber(metricsPayload.duration);
  if (videoDurationSeconds == null || !isFiniteNumber(resolvedLengthSeconds)) {
    return false;
  }

  const authoritativeLengthSeconds =
    toPositiveFiniteNumber(metricsPayload.lengthSeconds) ??
    toPositiveFiniteNumber(record?.videoDetails?.lengthSeconds);

  if (authoritativeLengthSeconds == null) {
    return false;
  }

  return (
    Math.abs(videoDurationSeconds - authoritativeLengthSeconds) >
    MEDIA_DURATION_SYNC_TOLERANCE_SECONDS
  );
}

function hasUsablePlaybackEvidence(metricsPayload) {
  const videoDurationSeconds = toPositiveFiniteNumber(metricsPayload.duration);
  const currentTimeSeconds = toFiniteNumber(metricsPayload.currentTime);
  return videoDurationSeconds != null && currentTimeSeconds != null;
}

function deriveRemainingTimeSeconds(resolvedLengthSeconds, currentTimeSeconds, playbackRate) {
  if (!isFiniteNumber(currentTimeSeconds)) {
    return resolvedLengthSeconds;
  }

  const safePlaybackRate = isFiniteNumber(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  return Math.max(0, (resolvedLengthSeconds - currentTimeSeconds) / safePlaybackRate);
}

export function derivePlaybackMetricUpdate({
  metricsPayload,
  record,
  requestedUrl,
  currentTabUrl,
}) {
  const payloadUrl =
    typeof metricsPayload?.url === 'string' && metricsPayload.url ? metricsPayload.url : null;
  if (
    !metricsPayload ||
    typeof metricsPayload !== 'object' ||
    shouldIgnoreStaleMetricsPayload({ payloadUrl, requestedUrl, currentTabUrl })
  ) {
    return null;
  }

  const resolvedLengthSeconds = resolveVideoLengthSeconds(metricsPayload, record);
  const currentTimeSeconds = Number(metricsPayload.currentTime ?? NaN);
  const playbackRate = Number(metricsPayload.playbackRate ?? 1);
  const isLiveNow =
    metricsPayload.isLive === true ? true : metricsPayload.isLive === false ? false : record.isLiveNow;
  const previousMediaStillApplies =
    record.videoElementReady === true &&
    areEquivalentVideoUrls(record.url, payloadUrl || currentTabUrl || requestedUrl);
  const playbackEvidenceIsUsable = hasUsablePlaybackEvidence(metricsPayload);

  const update = {
    nextUrl: payloadUrl || currentTabUrl || null,
    nextTitle: typeof metricsPayload.title === 'string' ? metricsPayload.title : null,
    contentScriptReady: true,
    videoElementReady:
      metricsPayload.videoElementReady === true ||
      previousMediaStillApplies ||
      playbackEvidenceIsUsable,
    isLiveNow,
    resolvedLengthSeconds: isFiniteNumber(resolvedLengthSeconds) ? resolvedLengthSeconds : null,
    remainingTime: null,
    remainingTimeNeedsRefresh: true,
  };

  if (isLiveNow) {
    update.remainingTimeNeedsRefresh = false;
    return update;
  }

  if (!isFiniteNumber(resolvedLengthSeconds)) {
    update.remainingTimeNeedsRefresh = !update.videoElementReady;
    return update;
  }

  if (hasMediaDurationMismatch(metricsPayload, record, resolvedLengthSeconds)) {
    update.videoElementReady = false;
    update.remainingTime = resolvedLengthSeconds;
    return update;
  }

  if (!update.videoElementReady) {
    update.remainingTime = resolvedLengthSeconds;
    return update;
  }

  update.remainingTime = deriveRemainingTimeSeconds(
    resolvedLengthSeconds,
    currentTimeSeconds,
    playbackRate,
  );
  update.remainingTimeNeedsRefresh = !isFiniteNumber(currentTimeSeconds);
  return update;
}
