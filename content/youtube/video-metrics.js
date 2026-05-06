import { RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { getPrimaryVideoElement } from './media-elements.js';

export function collectVideoMetrics({
  config,
  environment,
  collectPageDetails,
  isCurrentPageMediaReady,
}) {
  const video = getPrimaryVideoElement(environment);
  const details = collectPageDetails();
  return {
    title: details.title || null,
    url: details.url,
    pageMediaReady: isCurrentPageMediaReady(),
    lengthSeconds: config.isFiniteNumber(details.lengthSeconds) ? details.lengthSeconds : null,
    isLive: Boolean(details.isLive),
    duration: video && config.isFiniteNumber(video.duration) ? video.duration : null,
    currentTime: video && config.isFiniteNumber(video.currentTime) ? video.currentTime : null,
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
