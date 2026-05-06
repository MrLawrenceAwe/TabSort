import { inferIsLiveNow } from './live-status.js';
import { MEDIA_DURATION_SYNC_TOLERANCE_SECONDS, isFiniteNumber } from '../../shared/guards.js';

const DEFAULT_MEDIA_READY_STATE_THRESHOLD = 2;

export const youtubePageControllerConfig = {
  mediaReadyStateThreshold: DEFAULT_MEDIA_READY_STATE_THRESHOLD,
  mediaDurationSyncToleranceSeconds: MEDIA_DURATION_SYNC_TOLERANCE_SECONDS,
  isFiniteNumber,
  inferIsLiveNow,
};

export function createYoutubePageControllerState() {
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

export function shouldSendPageReadySignal(currentUrl, lastReadyUrl, { force = false } = {}) {
  return Boolean(currentUrl) && (force || currentUrl !== lastReadyUrl);
}
