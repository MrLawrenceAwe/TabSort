import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { createExtensionRuntimeBridge } from './extension-runtime-bridge.js';
import {
  DEFAULT_PAGE_CONTROLLER_CONFIG,
  PAGE_CONTROLLER_DEPENDENCIES,
} from './page-controller-config.js';
import { createPageControllerState } from './page-controller-state.js';
import { shouldSendContentScriptReadySignal } from './content-script-ready-signal.js';
import { createVideoMetricsReadinessTracker } from './video-metrics-readiness.js';
import { createTitleObserver } from './title-observer.js';
import { handleCollectVideoMetricsMessage } from './video-metrics.js';

const YOUTUBE_VIDEO_PAGE_REGEX = /^https?:\/\/([^/]+\.)?youtube\.com\/(?:watch\?|shorts\/)/i;

export function createYoutubePageController({
  config = {},
  environment = globalThis,
} = {}) {
  const controllerConfig = {
    ...DEFAULT_PAGE_CONTROLLER_CONFIG,
    ...PAGE_CONTROLLER_DEPENDENCIES,
    ...config,
  };
  const state = createPageControllerState();
  const { lifecycle, videoMetricsReadiness: videoMetricsReadinessState, titleObserver: titleObserverState } = state;

  const getDocument = () => environment.document ?? globalThis.document;
  const getWindow = () => environment.window ?? globalThis.window;
  const getLocation = () => environment.location ?? globalThis.location;
  const getChrome = () => environment.chrome ?? globalThis.chrome;
  const getMutationObserver = () => environment.MutationObserver ?? globalThis.MutationObserver;
  const {
    collectPageDetails,
    getCurrentPageUrl,
    hasExtensionRuntime,
    logContentError,
    publishPageVideoDetails,
    sendExtensionMessage,
  } = createExtensionRuntimeBridge({
    config: controllerConfig,
    environment,
    getChrome,
    getLocation,
  });

  function registerCleanup(cleanup) {
    if (typeof cleanup !== 'function') return;
    lifecycle.cleanupFns.push(cleanup);
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
    if (!video || !controllerConfig.isFiniteNumber(video.duration)) {
      return false;
    }
    const details = collectPageDetails();
    if (!controllerConfig.isFiniteNumber(details.lengthSeconds)) {
      return true;
    }
    return (
      Math.abs(video.duration - details.lengthSeconds) <=
      controllerConfig.mediaDurationSyncToleranceSeconds
    );
  }

  function dispatchContentScriptReadySignal({ force = false } = {}) {
    const currentUrl = getCurrentPageUrl();
    if (!shouldSendContentScriptReadySignal(currentUrl, lifecycle.lastScriptReadyUrl, { force })) {
      return;
    }
    lifecycle.lastScriptReadyUrl = currentUrl;
    sendExtensionMessage(
      createRuntimeMessage(RUNTIME_MESSAGE_TYPES.CONTENT_SCRIPT_READY),
      'content script ready',
    );
  }

  const videoMetricsReadiness = createVideoMetricsReadinessTracker({
    config: controllerConfig,
    environment,
    state: videoMetricsReadinessState,
    getCurrentPageUrl,
    getDocument,
    getMutationObserver,
    sendExtensionMessage,
    doesVideoDurationMatchPage,
  });
  const titleObserver = createTitleObserver({
    state: titleObserverState,
    getDocument,
    getMutationObserver,
    publishPageVideoDetails,
  });

  function disposeObservers() {
    videoMetricsReadiness.disposeVideoMetricsReadinessObservers();
    titleObserver.disposeTitleObservers();
  }

  function disposeListeners() {
    while (lifecycle.cleanupFns.length) {
      const cleanup = lifecycle.cleanupFns.pop();
      try {
        cleanup?.();
      } catch (error) {
        logContentError('Cleaning up content script listener', error);
      }
    }
    lifecycle.runtimeMessageListener = null;
  }

  function syncObservedPageUrl() {
    const currentUrl = getCurrentPageUrl();
    if (currentUrl && currentUrl !== lifecycle.observedPageUrl) {
      disposeObservers();
      lifecycle.observedPageUrl = currentUrl;
      lifecycle.lastScriptReadyUrl = null;
      videoMetricsReadinessState.metricsReadyPageUrl = null;
    } else if (!lifecycle.observedPageUrl && currentUrl) {
      lifecycle.observedPageUrl = currentUrl;
    }
  }

  function isVideoPageUrl(url) {
    return typeof url === 'string' && YOUTUBE_VIDEO_PAGE_REGEX.test(url);
  }

  function refreshPageState({ sendReadySignal = false, forceReadySignal = false } = {}) {
    syncObservedPageUrl();
    if (sendReadySignal) {
      dispatchContentScriptReadySignal({ force: forceReadySignal });
    }
    if (!isVideoPageUrl(getCurrentPageUrl())) {
      disposeObservers();
      return;
    }
    publishPageVideoDetails();
    videoMetricsReadiness.watchForVideoMount();
    titleObserver.watchTitleChanges();
  }

  function reset() {
    disposeObservers();
    disposeListeners();
    lifecycle.observedPageUrl = null;
    lifecycle.lastScriptReadyUrl = null;
    videoMetricsReadinessState.metricsReadyPageUrl = null;
    videoMetricsReadinessState.lastMetricsReadyVideo = null;
    videoMetricsReadinessState.lastMetricsReadyFingerprint = null;
    lifecycle.initialized = false;
  }

  function bootstrap() {
    if (lifecycle.initialized) return;
    lifecycle.initialized = true;

    if (!hasExtensionRuntime()) return;

    const runtimeWindow = getWindow();
    const runtimeDocument = getDocument();
    lifecycle.runtimeMessageListener = (message, _sender, sendResponse) =>
      handleCollectVideoMetricsMessage(message, sendResponse, {
        config: controllerConfig,
        environment,
        collectPageDetails,
        isCurrentVideoMetricsReady: videoMetricsReadiness.isCurrentVideoMetricsReady,
        markCurrentVideoMetricsReadyIfAvailable:
          videoMetricsReadiness.markCurrentVideoMetricsReadyIfAvailable,
      });
    addRuntimeMessageListener(lifecycle.runtimeMessageListener);

    if (
      runtimeDocument?.readyState === 'complete' ||
      runtimeDocument?.readyState === 'interactive'
    ) {
      refreshPageState({ sendReadySignal: true });
    } else {
      addWindowEventListener(
        runtimeWindow,
        'DOMContentLoaded',
        () => refreshPageState({ sendReadySignal: true }),
        { once: true },
      );
    }

    addWindowEventListener(runtimeWindow, 'yt-navigate-finish', () => {
      refreshPageState({ sendReadySignal: true });
    });

    addWindowEventListener(runtimeWindow, 'pageshow', (event) => {
      if (event.persisted) {
        refreshPageState({ sendReadySignal: true, forceReadySignal: true });
      }
    });

    addWindowEventListener(runtimeWindow, 'pagehide', () => {
      disposeObservers();
      lifecycle.lastScriptReadyUrl = null;
      videoMetricsReadinessState.metricsReadyPageUrl = null;
      videoMetricsReadinessState.lastMetricsReadyVideo = null;
      videoMetricsReadinessState.lastMetricsReadyFingerprint = null;
    });
  }

  return {
    bootstrap,
    refreshPageState,
    reset,
  };
}

const defaultYoutubePageController = createYoutubePageController();

export function bootstrapYoutubePageController() {
  defaultYoutubePageController.bootstrap();
}
