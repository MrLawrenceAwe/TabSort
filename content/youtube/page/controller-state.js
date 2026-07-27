function createPlaybackReadinessState() {
  return {
    videoMountObserver: null,
    playbackReadyPageUrl: null,
    lastReadyVideo: null,
    lastReadyFingerprint: null,
    playbackReadyListenerVideo: null,
    playbackReadyListenerCleanup: null,
    videoMountCheckScheduled: false,
    videoMountCheckToken: 0,
  };
}

function createTitleObserverState() {
  return {
    titleElementObserver: null,
    titleTextObserver: null,
    observedTitleElement: null,
    lastKnownTitleText: null,
  };
}

function createControllerLifecycleState() {
  return {
    initialized: false,
    observedPageUrl: null,
    lastScriptReadyUrl: null,
    cleanupFns: [],
  };
}

export function createPageControllerState() {
  return {
    lifecycle: createControllerLifecycleState(),
    playbackReadiness: createPlaybackReadinessState(),
    titleObserver: createTitleObserverState(),
  };
}
