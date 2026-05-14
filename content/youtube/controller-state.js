import { inferIsLiveNow } from './live-status.js';
import { MEDIA_DURATION_SYNC_TOLERANCE_SECONDS, isFiniteNumber } from '../../shared/guards.js';

const DEFAULT_MEDIA_READY_STATE_THRESHOLD = 2;

export const DEFAULT_PAGE_CONTROLLER_OPTIONS = {
  mediaReadyStateThreshold: DEFAULT_MEDIA_READY_STATE_THRESHOLD,
  mediaDurationSyncToleranceSeconds: MEDIA_DURATION_SYNC_TOLERANCE_SECONDS,
};

export const pageControllerDependencies = {
  isFiniteNumber,
  inferIsLiveNow,
};

export function createMediaReadinessState() {
  return {
    videoMountObserver: null,
    mediaReadyPageUrl: null,
    lastReadyVideo: null,
    lastMediaReadyFingerprint: null,
    mediaReadyListenerVideo: null,
    mediaReadyListenerCleanup: null,
    videoMountCheckScheduled: false,
    videoMountCheckToken: 0,
  };
}

export function createTitleObserverState() {
  return {
    titleElementObserver: null,
    titleTextObserver: null,
    observedTitleElement: null,
    lastKnownTitleText: null,
  };
}

export function createControllerLifecycleState() {
  return {
    initialized: false,
    observedPageUrl: null,
    lastScriptReadyUrl: null,
    cleanupFns: [],
    runtimeMessageListener: null,
  };
}

export function createPageControllerState() {
  return {
    lifecycle: createControllerLifecycleState(),
    mediaReadiness: createMediaReadinessState(),
    titleObserver: createTitleObserverState(),
  };
}

export function shouldSendContentScriptReadySignal(currentUrl, lastScriptReadyUrl, { force = false } = {}) {
  return Boolean(currentUrl) && (force || currentUrl !== lastScriptReadyUrl);
}
