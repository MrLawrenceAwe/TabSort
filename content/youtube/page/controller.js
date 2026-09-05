import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../../../shared/messages.js';
import { createExtensionRuntimeBridge } from './runtime-bridge.js';
import { DEFAULT_PAGE_CONFIG } from './config.js';
import { isFiniteNumber } from '../../../shared/guards.js';
import { inferIsLiveNow } from '../metadata/live-status.js';
import { shouldSendContentScriptReadySignal } from './ready-signal.js';
import { createPlaybackReadinessTracker } from '../media/playback-readiness.js';
import { createTitleObserver } from '../metadata/title-observer.js';
import { handleCollectVideoMetricsMessage } from '../media/metrics.js';
import { isYouTubeVideoPage } from '../../../shared/youtube/urls.js';

export function createYouTubePageController({
  config = {},
  dependencies = {},
  environment = globalThis,
} = {}) {
  const pageConfig = {
    ...DEFAULT_PAGE_CONFIG,
    ...config,
  };
  const pageDependencies = { inferIsLiveNow, ...dependencies };
  const lifecycle = {
    initialized: false,
    observedPageUrl: null,
    lastScriptReadyUrl: null,
    cleanupCallbacks: [],
  };

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
    dependencies: pageDependencies,
    environment,
    getChrome,
    getLocation,
  });

  function registerCleanup(cleanup) {
    if (typeof cleanup !== 'function') return;
    lifecycle.cleanupCallbacks.push(cleanup);
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
    if (!video || !isFiniteNumber(video.duration)) {
      return false;
    }
    const details = collectPageDetails();
    if (!isFiniteNumber(details.lengthSeconds)) {
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
    getCurrentPageUrl,
    getDocument,
    getMutationObserver,
    sendExtensionMessage,
    doesMediaMatchPageMetadata,
  });
  const titleObserver = createTitleObserver({
    getDocument,
    getMutationObserver,
    publishPageVideoDetails,
  });

  function disposeObservers() {
    playbackReadiness.dispose();
    titleObserver.dispose();
  }

  function disposeListeners() {
    while (lifecycle.cleanupCallbacks.length) {
      const cleanup = lifecycle.cleanupCallbacks.pop();
      try {
        cleanup?.();
      } catch (error) {
        logContentError('Cleaning up content script listener', error);
      }
    }
  }

  function syncObservedPageUrl() {
    const currentUrl = getCurrentPageUrl();
    if (currentUrl && currentUrl !== lifecycle.observedPageUrl) {
      titleObserver.dispose();
      lifecycle.observedPageUrl = currentUrl;
      lifecycle.lastScriptReadyUrl = null;
      playbackReadiness.resetForNavigation();
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
    titleObserver.dispose();
    disposeListeners();
    lifecycle.observedPageUrl = null;
    lifecycle.lastScriptReadyUrl = null;
    playbackReadiness.reset();
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
      titleObserver.dispose();
      lifecycle.lastScriptReadyUrl = null;
      playbackReadiness.reset();
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
