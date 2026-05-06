import { inferIsLiveNow } from './live-status.js';
import { isFiniteNumber } from '../../shared/guards.js';

const DEFAULT_MEDIA_READY_STATE_THRESHOLD = 2;

export const pageRuntimeConfig = {
  mediaReadyStateThreshold: DEFAULT_MEDIA_READY_STATE_THRESHOLD,
  isFiniteNumber,
  inferIsLiveNow,
};

export function createRuntimeState() {
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
