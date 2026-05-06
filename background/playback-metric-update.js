import { isFiniteNumber } from '../shared/guards.js';
import { getYoutubeVideoIdentity } from './youtube-url-utils.js';

const MEDIA_DURATION_SYNC_TOLERANCE_SECONDS = 2;

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
  const pageLengthSeconds = Number(metricsPayload.lengthSeconds ?? NaN);
  if (isFiniteNumber(pageLengthSeconds)) {
    return pageLengthSeconds;
  }

  const recordedLengthSeconds = Number(record?.videoDetails?.lengthSeconds ?? NaN);
  if (isFiniteNumber(recordedLengthSeconds)) {
    return recordedLengthSeconds;
  }

  return Number(metricsPayload.duration ?? NaN);
}

function hasMediaDurationMismatch(metricsPayload, record, resolvedLengthSeconds) {
  const videoDurationSeconds = Number(metricsPayload.duration ?? NaN);
  if (!isFiniteNumber(videoDurationSeconds) || !isFiniteNumber(resolvedLengthSeconds)) {
    return false;
  }

  const pageLengthSeconds = Number(metricsPayload.lengthSeconds ?? NaN);
  const recordedLengthSeconds = Number(record?.videoDetails?.lengthSeconds ?? NaN);
  const authoritativeLengthSeconds = isFiniteNumber(pageLengthSeconds)
    ? pageLengthSeconds
    : recordedLengthSeconds;

  if (!isFiniteNumber(authoritativeLengthSeconds)) {
    return false;
  }

  return (
    Math.abs(videoDurationSeconds - authoritativeLengthSeconds) >
    MEDIA_DURATION_SYNC_TOLERANCE_SECONDS
  );
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

  const update = {
    nextUrl: payloadUrl || currentTabUrl || null,
    nextTitle: typeof metricsPayload.title === 'string' ? metricsPayload.title : null,
    pageRuntimeReady: true,
    pageMediaReady: metricsPayload.pageMediaReady === true,
    isLiveNow,
    resolvedLengthSeconds: isFiniteNumber(resolvedLengthSeconds) ? resolvedLengthSeconds : null,
    remainingTime: null,
    isRemainingTimeStale: true,
  };

  if (isLiveNow) {
    update.isRemainingTimeStale = false;
    return update;
  }

  if (!isFiniteNumber(resolvedLengthSeconds)) {
    update.isRemainingTimeStale = !update.pageMediaReady;
    return update;
  }

  if (hasMediaDurationMismatch(metricsPayload, record, resolvedLengthSeconds)) {
    update.pageMediaReady = false;
    update.remainingTime = resolvedLengthSeconds;
    return update;
  }

  if (!update.pageMediaReady) {
    update.remainingTime = resolvedLengthSeconds;
    return update;
  }

  update.remainingTime = deriveRemainingTimeSeconds(
    resolvedLengthSeconds,
    currentTimeSeconds,
    playbackRate,
  );
  update.isRemainingTimeStale = !isFiniteNumber(currentTimeSeconds);
  return update;
}
