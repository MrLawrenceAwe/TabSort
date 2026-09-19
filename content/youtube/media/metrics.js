import { RUNTIME_MESSAGE_TYPES } from '../../../shared/messages.js';
import { isFiniteNumber, toFiniteNumber, toPositiveFiniteNumber } from '../../../shared/guards.js';
import { getPrimaryVideoElement } from './elements.js';

function getYouTubePlayer(environment = globalThis) {
  const runtimeDocument = environment.document ?? globalThis.document;
  return runtimeDocument?.querySelector?.('#movie_player') || null;
}

function getVideoDurationSeconds(video, player) {
  return (
    toPositiveFiniteNumber(video?.duration) ??
    toPositiveFiniteNumber(player?.getDuration?.())
  );
}

function getVideoCurrentTimeSeconds(video, player) {
  return toFiniteNumber(video?.currentTime) ?? toFiniteNumber(player?.getCurrentTime?.());
}

export function collectVideoMetrics({
  environment,
  collectPageDetails,
  isCurrentPlaybackReady,
  tryMarkPlaybackReady,
}) {
  const video = getPrimaryVideoElement(environment);
  const player = getYouTubePlayer(environment);
  const details = collectPageDetails();
  tryMarkPlaybackReady?.({ notify: false });
  return {
    title: details.title || null,
    url: details.url,
    playbackMetricsReady: isCurrentPlaybackReady(),
    metadataDurationSeconds: isFiniteNumber(details.lengthSeconds) ? details.lengthSeconds : null,
    isLive: Boolean(details.isLive),
    mediaDurationSeconds: getVideoDurationSeconds(video, player),
    positionSeconds: getVideoCurrentTimeSeconds(video, player),
    playbackRate:
      video && isFiniteNumber(video.playbackRate) && video.playbackRate > 0
        ? video.playbackRate
        : 1,
  };
}

export function handleCollectVideoMetricsMessage(message, sendResponse, options) {
  if (!message || message.type !== RUNTIME_MESSAGE_TYPES.COLLECT_VIDEO_METRICS) return false;
  sendResponse(collectVideoMetrics(options));
  return true;
}
