import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../../../shared/messages.js';
import { createExtensionRuntimeBridge } from './runtime-bridge.js';
import {
  DEFAULT_PAGE_CONFIG,
  DEFAULT_PAGE_DEPENDENCIES,
} from './config.js';
import { createPageControllerState } from './controller-state.js';
import { shouldSendContentScriptReadySignal } from './ready-signal.js';
import { createPlaybackReadinessTracker } from '../media/playback-readiness.js';
import { createTitleObserver } from '../metadata/title-observer.js';
import { handleCollectVideoMetricsMessage } from '../media/metrics.js';
import { isYouTubeVideoPage } from '../../../shared/youtube/urls.js';

export function createYouTubePageController({
  config = {},
  environment = globalThis,
} = {}) {
  const pageConfig = {
    ...DEFAULT_PAGE_CONFIG,
    ...DEFAULT_PAGE_DEPENDENCIES,
    ...config,
  };
  const state = createPageControllerState();
  const { lifecycle, playbackReadiness: playbackReadinessState, titleObserver: titleObserverState } = state;

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
    config: pageConfig,
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

  function doesMediaMatchPageMetadata(video) {
    if (!video || !pageConfig.isFiniteNumber(video.duration)) {
      return false;
    }
    const details = collectPageDetails();
    if (!pageConfig.isFiniteNumber(details.lengthSeconds)) {
      return true;
    }
    return (
      Math.abs(video.duration - details.lengthSeconds) <=
      pageConfig.mediaDurationSyncToleranceSeconds
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

  const playbackReadiness = createPlaybackReadinessTracker({
    config: pageConfig,
    environment,
    state: playbackReadinessState,
    getCurrentPageUrl,
    getDocument,
    getMutationObserver,
    sendExtensionMessage,
    doesMediaMatchPageMetadata,
  });
  const titleObserver = createTitleObserver({
    state: titleObserverState,
    getDocument,
    getMutationObserver,
    publishPageVideoDetails,
  });

  function disposeObservers() {
    playbackReadiness.disposePlaybackReadinessObservers();
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
  }

  function resetPlaybackReadinessState() {
    playbackReadinessState.playbackReadyPageUrl = null;
    playbackReadinessState.lastReadyVideo = null;
    playbackReadinessState.lastReadyFingerprint = null;
  }

  function syncObservedPageUrl() {
    const currentUrl = getCurrentPageUrl();
    if (currentUrl && currentUrl !== lifecycle.observedPageUrl) {
      disposeObservers();
      lifecycle.observedPageUrl = currentUrl;
      lifecycle.lastScriptReadyUrl = null;
      playbackReadinessState.playbackReadyPageUrl = null;
    }
  }

  function refreshPageState({ sendReadySignal = false, forceReadySignal = false } = {}) {
    syncObservedPageUrl();
    if (sendReadySignal) {
      dispatchContentScriptReadySignal({ force: forceReadySignal });
    }
    if (!isYouTubeVideoPage(getCurrentPageUrl())) {
      disposeObservers();
      return;
    }
    publishPageVideoDetails();
    playbackReadiness.watchForVideoMount();
    titleObserver.watchTitleChanges();
  }

  function reset() {
    disposeObservers();
    disposeListeners();
    lifecycle.observedPageUrl = null;
    lifecycle.lastScriptReadyUrl = null;
    resetPlaybackReadinessState();
    lifecycle.initialized = false;
  }

  function bootstrap() {
    if (lifecycle.initialized) return;
    lifecycle.initialized = true;

    if (!hasExtensionRuntime()) return;

    const runtimeWindow = getWindow();
    const runtimeDocument = getDocument();
    const messageListener = (message, _sender, sendResponse) =>
      handleCollectVideoMetricsMessage(message, sendResponse, {
        config: pageConfig,
        environment,
        collectPageDetails,
        isCurrentPlaybackReady: playbackReadiness.isCurrentPlaybackReady,
        markCurrentPlaybackReadyIfAvailable:
          playbackReadiness.markCurrentPlaybackReadyIfAvailable,
      });
    addRuntimeMessageListener(messageListener);

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
      resetPlaybackReadinessState();
    });
  }

  return {
    bootstrap,
    refreshPageState,
    reset,
  };
}

const defaultYouTubePageController = createYouTubePageController();

export function bootstrapYouTubePageController() {
  defaultYouTubePageController.bootstrap();
}
