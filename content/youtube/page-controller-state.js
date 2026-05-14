export function createVideoMetricsReadinessState() {
  return {
    videoMountObserver: null,
    metricsReadyPageUrl: null,
    lastMetricsReadyVideo: null,
    lastMetricsReadyFingerprint: null,
    videoMetricsReadyListenerVideo: null,
    videoMetricsReadyListenerCleanup: null,
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
    videoMetricsReadiness: createVideoMetricsReadinessState(),
    titleObserver: createTitleObserverState(),
  };
}
