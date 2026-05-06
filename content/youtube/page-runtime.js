import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { createRuntimeMessaging } from './messaging.js';
import {
  createRuntimeState,
  pageRuntimeConfig,
  shouldSendPageRuntimeReadySignal,
} from './runtime-state.js';
import { createMediaReadinessTracker } from './media-readiness.js';
import { createTitleObserver } from './title-observer.js';
import { handleCollectVideoMetricsMessage } from './video-metrics.js';

export function createPageRuntime({
  config = pageRuntimeConfig,
  environment = globalThis,
} = {}) {
  const state = createRuntimeState();

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
  } = createRuntimeMessaging({
    config,
    environment,
    getChrome,
    getLocation,
  });

  function registerCleanup(cleanup) {
    if (typeof cleanup !== 'function') return;
    state.cleanupFns.push(cleanup);
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

  function sendPageRuntimeReady({ force = false } = {}) {
    const currentUrl = getCurrentPageUrl();
    if (
      !shouldSendPageRuntimeReadySignal(currentUrl, state.lastReadyUrl, { force })
    ) {
      return;
    }
    state.lastReadyUrl = currentUrl;
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
    while (state.cleanupFns.length) {
      const cleanup = state.cleanupFns.pop();
      try {
        cleanup?.();
      } catch (error) {
        logContentError('Cleaning up page runtime listener', error);
      }
    }
    state.runtimeMessageListener = null;
  }

  function syncPageRuntime() {
    const currentUrl = getCurrentPageUrl();
    if (currentUrl && currentUrl !== state.observedPageUrl) {
      disposeObservers();
      state.observedPageUrl = currentUrl;
      state.lastReadyUrl = null;
      state.mediaReadyUrl = null;
    } else if (!state.observedPageUrl && currentUrl) {
      state.observedPageUrl = currentUrl;
    }
  }

  function refreshPageState({ includeReadySignal = false, forceReadySignal = false } = {}) {
    syncPageRuntime();
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
    state.lastReadyUrl = null;
    state.mediaReadyUrl = null;
    state.lastReadyVideo = null;
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
      state.lastReadyUrl = null;
      state.mediaReadyUrl = null;
      state.lastReadyVideo = null;
      state.lastMediaReadyFingerprint = null;
    });
  }

  return {
    bootstrap,
    refreshPageState,
    reset,
  };
}

const defaultPageRuntime = createPageRuntime();

export function resetRuntimeStateForTests() {
  defaultPageRuntime.reset();
}

export function bootstrapPageRuntime() {
  defaultPageRuntime.bootstrap();
}
