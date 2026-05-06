import { MEDIA_READY_STATE_THRESHOLD } from './media-config.js';
import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { inferIsLiveNow } from './live-status.js';
import { isFiniteNumber } from '../../shared/guards.js';
import { collectPageVideoDetails } from './video-details.js';
import { createMediaReadinessTracker } from './media-readiness.js';
import { createTitleObserver } from './title-observer.js';
import { handleCollectVideoMetricsMessage } from './video-metrics.js';

const pageSessionConfig = {
  mediaReadyStateThreshold: MEDIA_READY_STATE_THRESHOLD,
  isFiniteNumber,
  inferIsLiveNow,
};

function createPageSessionState() {
  return {
    initialized: false,
    videoMountObserver: null,
    titleElementObserver: null,
    titleTextObserver: null,
    observedTitleElement: null,
    lastKnownTitleText: null,
    observedPageUrl: null,
    lastRuntimeReadyPageUrl: null,
    mediaReadyPageUrl: null,
    lastMediaReadyVideoElement: null,
    lastMediaReadyFingerprint: null,
    mediaReadyListenerVideo: null,
    mediaReadyListenerCleanup: null,
    listenerCleanupCallbacks: [],
    runtimeMessageListener: null,
  };
}

export function shouldSendPageRuntimeReadySignal(currentUrl, lastReadyUrl, { force = false } = {}) {
  return Boolean(currentUrl) && (force || currentUrl !== lastReadyUrl);
}

export function createYoutubePageSession({
  config = pageSessionConfig,
  environment = globalThis,
} = {}) {
  const state = createPageSessionState();

  const getDocument = () => environment.document ?? globalThis.document;
  const getWindow = () => environment.window ?? globalThis.window;
  const getLocation = () => environment.location ?? globalThis.location;
  const getChrome = () => environment.chrome ?? globalThis.chrome;
  const getMutationObserver = () => environment.MutationObserver ?? globalThis.MutationObserver;

  function logContentError(context, error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[TabSort] ${context}: ${message}`);
  }

  function hasExtensionRuntime() {
    return Boolean(getChrome()?.runtime?.id);
  }

  function sendExtensionMessage(payload, context) {
    if (!hasExtensionRuntime()) return false;
    try {
      getChrome().runtime.sendMessage(payload);
      return true;
    } catch (error) {
      if (context) logContentError(`Sending ${context}`, error);
      return false;
    }
  }

  function getCurrentPageUrl() {
    return getLocation()?.href || '';
  }

  function collectPageDetails() {
    return collectPageVideoDetails({
      environment,
      inferIsLiveNow: config.inferIsLiveNow,
      logContentError,
    });
  }

  function registerCleanup(cleanup) {
    if (typeof cleanup !== 'function') return;
    state.listenerCleanupCallbacks.push(cleanup);
  }

  function addWindowEventListener(target, type, listener, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener, options);
    registerCleanup(() => {
      target.removeEventListener?.(type, listener, options);
    });
  }

  function addRuntimeMessageListener(listener) {
    const runtime = getChrome()?.runtime;
    const messageBus = runtime?.onMessage;
    if (!messageBus?.addListener) return;
    messageBus.addListener(listener);
    registerCleanup(() => {
      messageBus.removeListener?.(listener);
    });
  }

  function doesVideoDurationMatchPage(video) {
    if (!video || !config.isFiniteNumber(video.duration)) {
      return false;
    }
    const details = collectPageDetails();
    if (!config.isFiniteNumber(details.lengthSeconds)) {
      return true;
    }
    return Math.abs(video.duration - details.lengthSeconds) <= 2;
  }

  function publishPageVideoDetails() {
    try {
      const details = collectPageDetails();
      if (details.title || details.lengthSeconds != null || details.isLive) {
        sendExtensionMessage(
          createRuntimeMessage(RUNTIME_MESSAGE_TYPES.PAGE_VIDEO_DETAILS, { details }),
          'page video details',
        );
      }
    } catch (error) {
      logContentError('Sending page video details', error);
    }
  }

  function sendPageRuntimeReady({ force = false } = {}) {
    const currentUrl = getCurrentPageUrl();
    if (
      !shouldSendPageRuntimeReadySignal(currentUrl, state.lastRuntimeReadyPageUrl, { force })
    ) {
      return;
    }
    state.lastRuntimeReadyPageUrl = currentUrl;
    sendExtensionMessage(
      createRuntimeMessage(RUNTIME_MESSAGE_TYPES.PAGE_RUNTIME_READY),
      'page runtime ready',
    );
  }

  const mediaReadiness = createMediaReadinessTracker({
    config,
    environment,
    state,
    getCurrentPageUrl,
    getDocument,
    getMutationObserver,
    sendExtensionMessage,
    doesVideoDurationMatchPage,
  });
  const titleObserver = createTitleObserver({
    state,
    getDocument,
    getMutationObserver,
    publishPageVideoDetails,
  });

  function disposeObservers() {
    mediaReadiness.disposeMediaObservers();
    titleObserver.disposeTitleObservers();
  }

  function disposeListeners() {
    while (state.listenerCleanupCallbacks.length) {
      const cleanup = state.listenerCleanupCallbacks.pop();
      try {
        cleanup?.();
      } catch (error) {
        logContentError('Cleaning up page runtime listener', error);
      }
    }
    state.runtimeMessageListener = null;
  }

  function syncPageSession() {
    const currentUrl = getCurrentPageUrl();
    if (currentUrl && currentUrl !== state.observedPageUrl) {
      disposeObservers();
      state.observedPageUrl = currentUrl;
      state.lastRuntimeReadyPageUrl = null;
      state.mediaReadyPageUrl = null;
    } else if (!state.observedPageUrl && currentUrl) {
      state.observedPageUrl = currentUrl;
    }
  }

  function refreshPageState({ includeReadySignal = false, forceReadySignal = false } = {}) {
    syncPageSession();
    if (includeReadySignal) {
      sendPageRuntimeReady({ force: forceReadySignal });
    }
    publishPageVideoDetails();
    mediaReadiness.watchForVideoMount();
    titleObserver.watchTitleChanges();
  }

  function reset() {
    disposeObservers();
    disposeListeners();
    state.observedPageUrl = null;
    state.lastRuntimeReadyPageUrl = null;
    state.mediaReadyPageUrl = null;
    state.lastMediaReadyVideoElement = null;
    state.lastMediaReadyFingerprint = null;
    state.initialized = false;
  }

  function bootstrap() {
    if (state.initialized) return;
    state.initialized = true;

    if (!hasExtensionRuntime()) return;

    const runtimeWindow = getWindow();
    const runtimeDocument = getDocument();
    state.runtimeMessageListener = (message, _sender, sendResponse) =>
      handleCollectVideoMetricsMessage(message, sendResponse, {
        config,
        environment,
        collectPageDetails,
        isCurrentPageMediaReady: mediaReadiness.isCurrentPageMediaReady,
      });
    addRuntimeMessageListener(state.runtimeMessageListener);

    if (
      runtimeDocument?.readyState === 'complete' ||
      runtimeDocument?.readyState === 'interactive'
    ) {
      refreshPageState({ includeReadySignal: true });
    } else {
      addWindowEventListener(
        runtimeWindow,
        'DOMContentLoaded',
        () => refreshPageState({ includeReadySignal: true }),
        { once: true },
      );
    }

    addWindowEventListener(runtimeWindow, 'yt-navigate-finish', () => {
      refreshPageState({ includeReadySignal: true });
    });

    addWindowEventListener(runtimeWindow, 'pageshow', (event) => {
      if (event.persisted) {
        refreshPageState({ includeReadySignal: true, forceReadySignal: true });
      }
    });

    addWindowEventListener(runtimeWindow, 'pagehide', () => {
      disposeObservers();
      state.lastRuntimeReadyPageUrl = null;
      state.mediaReadyPageUrl = null;
      state.lastMediaReadyVideoElement = null;
      state.lastMediaReadyFingerprint = null;
    });
  }

  return {
    bootstrap,
    refreshPageState,
    reset,
  };
}

const defaultYoutubePageSession = createYoutubePageSession();

export function resetRuntimeStateForTests() {
  defaultYoutubePageSession.reset();
}

export function bootstrapYoutubePageSession() {
  defaultYoutubePageSession.bootstrap();
}
