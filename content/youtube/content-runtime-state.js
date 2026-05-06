import { MEDIA_READY_STATE_THRESHOLD } from './media-config.js';
import { inferIsLiveNow } from './live-status.js';
import { isFiniteNumber } from '../../shared/guards.js';

export const youtubeContentRuntimeConfig = {
  mediaReadyStateThreshold: MEDIA_READY_STATE_THRESHOLD,
  isFiniteNumber,
  inferIsLiveNow,
};

export function createContentRuntimeState() {
  return {
    initialized: false,
    videoMountObserver: null,
    titleElementObserver: null,
    titleTextObserver: null,
    observedTitleElement: null,
    lastKnownTitleText: null,
    observedPageUrl: null,
    lastReadyUrl: null,
    mediaReadyUrl: null,
    lastReadyVideo: null,
    lastMediaReadyFingerprint: null,
    mediaReadyListenerVideo: null,
    mediaReadyListenerCleanup: null,
    cleanupFns: [],
    runtimeMessageListener: null,
  };
}

export function shouldSendPageRuntimeReadySignal(currentUrl, lastReadyUrl, { force = false } = {}) {
  return Boolean(currentUrl) && (force || currentUrl !== lastReadyUrl);
}
