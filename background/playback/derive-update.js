import {
  isFiniteNumber,
  toFiniteNumber,
  toPositiveFiniteNumber,
} from '../../shared/guards.js';
import { MEDIA_DURATION_SYNC_TOLERANCE_SECONDS } from '../../shared/playback/constants.js';
import { getYouTubeVideoId } from '../../shared/youtube/urls.js';

function areEquivalentVideoUrls(leftUrl, rightUrl) {
  const leftIdentity = getYouTubeVideoId(leftUrl);
  const rightIdentity = getYouTubeVideoId(rightUrl);

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

function resolveVideoDurationSeconds(metricsPayload, record) {
  const metadataDurationSeconds = toPositiveFiniteNumber(metricsPayload.metadataDurationSeconds);
  if (metadataDurationSeconds != null) {
    return metadataDurationSeconds;
  }

  const recordedDurationSeconds = toPositiveFiniteNumber(record?.videoDetails?.durationSeconds);
  if (recordedDurationSeconds != null) {
    return recordedDurationSeconds;
  }

  return toPositiveFiniteNumber(metricsPayload.mediaDurationSeconds) ?? NaN;
}

function hasMediaDurationMismatch(metricsPayload, record, resolvedDurationSeconds) {
  const videoDurationSeconds = toFiniteNumber(metricsPayload.mediaDurationSeconds);
  if (videoDurationSeconds == null || !isFiniteNumber(resolvedDurationSeconds)) {
    return false;
  }

  const authoritativeDurationSeconds =
    toPositiveFiniteNumber(metricsPayload.metadataDurationSeconds) ??
    toPositiveFiniteNumber(record?.videoDetails?.durationSeconds);

  if (authoritativeDurationSeconds == null) {
    return false;
  }

  return (
    Math.abs(videoDurationSeconds - authoritativeDurationSeconds) >
    MEDIA_DURATION_SYNC_TOLERANCE_SECONDS
  );
}

function deriveRemainingTimeSeconds(resolvedDurationSeconds, currentTimeSeconds, playbackRate) {
  if (!isFiniteNumber(currentTimeSeconds)) {
    return resolvedDurationSeconds;
  }

  const safePlaybackRate = isFiniteNumber(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  return Math.max(0, (resolvedDurationSeconds - currentTimeSeconds) / safePlaybackRate);
}

export function derivePlaybackUpdate({
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

  const resolvedDurationSeconds = resolveVideoDurationSeconds(metricsPayload, record);
  const currentTimeSeconds = Number(metricsPayload.positionSeconds ?? NaN);
  const playbackRate = Number(metricsPayload.playbackRate ?? 1);
  const isLive =
    metricsPayload.isLive === true ? true : metricsPayload.isLive === false ? false : record.isLive;

  const update = {
    nextUrl: payloadUrl || currentTabUrl || null,
    nextTitle: typeof metricsPayload.title === 'string' ? metricsPayload.title : null,
    contentScriptReady: true,
    playbackMetricsReady:
      metricsPayload.playbackMetricsReady === true,
    isLive,
    resolvedDurationSeconds: isFiniteNumber(resolvedDurationSeconds) ? resolvedDurationSeconds : null,
    remainingSeconds: null,
    remainingSecondsStale: true,
  };

  if (isLive) {
    update.remainingSecondsStale = false;
    return update;
  }

  if (!isFiniteNumber(resolvedDurationSeconds)) {
    update.remainingSecondsStale = !update.playbackMetricsReady;
    return update;
  }

  if (hasMediaDurationMismatch(metricsPayload, record, resolvedDurationSeconds)) {
    update.playbackMetricsReady = false;
    update.remainingSeconds = resolvedDurationSeconds;
    return update;
  }

  if (!update.playbackMetricsReady) {
    update.remainingSeconds = resolvedDurationSeconds;
    return update;
  }

  update.remainingSeconds = deriveRemainingTimeSeconds(
    resolvedDurationSeconds,
    currentTimeSeconds,
    playbackRate,
  );
  update.remainingSecondsStale = !isFiniteNumber(currentTimeSeconds);
  return update;
}
