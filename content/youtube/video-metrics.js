import { RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { toFiniteNumber, toPositiveFiniteNumber } from '../../shared/guards.js';
import { getPrimaryVideoElement } from './media-elements.js';

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
  config,
  environment,
  collectPageDetails,
  isCurrentVideoElementReady,
  markCurrentVideoElementReadyIfAvailable,
}) {
  const video = getPrimaryVideoElement(environment);
  const player = getYouTubePlayer(environment);
  const details = collectPageDetails();
  markCurrentVideoElementReadyIfAvailable?.({ notify: false });
  return {
    title: details.title || null,
    url: details.url,
    videoElementReady: isCurrentVideoElementReady(),
    lengthSeconds: config.isFiniteNumber(details.lengthSeconds) ? details.lengthSeconds : null,
    isLive: Boolean(details.isLive),
    duration: getVideoDurationSeconds(video, player),
    currentTime: getVideoCurrentTimeSeconds(video, player),
    playbackRate:
      video && config.isFiniteNumber(video.playbackRate) && video.playbackRate > 0
        ? video.playbackRate
        : 1,
    paused: video ? video.paused : null,
  };
}

export function handleCollectVideoMetricsMessage(message, sendResponse, options) {
  if (!message || message.type !== RUNTIME_MESSAGE_TYPES.COLLECT_VIDEO_METRICS) return false;
  sendResponse(collectVideoMetrics(options));
  return true;
}
