import { MEDIA_READY_STATE_THRESHOLD } from '../../shared/constants.js';
import { inferIsLiveNow } from './live-status.js';
import { isFiniteNumber } from '../../shared/guards.js';
import { collectPageVideoDetails, getPrimaryVideoElement } from './metadata.js';

const runtimeConfig = {
  mediaReadyStateThreshold: MEDIA_READY_STATE_THRESHOLD,
  isFiniteNumber,
  inferIsLiveNow,
};

function createRuntimeState() {
  return {
    initialized: false,
    videoMountObserver: null,
    titleElementObserver: null,
    titleTextObserver: null,
    observedTitleElement: null,
    lastKnownTitleText: null,
    observedPageUrl: null,
    runtimeReadyUrl: null,
    mediaReadyUrl: null,
    lastMediaReadyVideoElement: null,
    lastMediaReadyFingerprint: null,
    mediaReadyListenerVideo: null,
    mediaReadyListenerCleanup: null,
  };
}

export function shouldSendPageRuntimeReady(currentUrl, lastReadyUrl, { force = false } = {}) {
  return Boolean(currentUrl) && (force || currentUrl !== lastReadyUrl);
}

export function createPageRuntimeSession({
  config = runtimeConfig,
  environment = globalThis,
} = {}) {
  const state = createRuntimeState();

  const getDocument = () => environment.document ?? globalThis.document;
  const getWindow = () => environment.window ?? globalThis.window;
  const getLocation = () => environment.location ?? globalThis.location;
  const getChrome = () => environment.chrome ?? globalThis.chrome;
  const getMutationObserver = () => environment.MutationObserver ?? globalThis.MutationObserver;

  function logContentError(context, error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[TabSort] ${context}: ${message}`);
  }

  function hasRuntime() {
    return Boolean(getChrome()?.runtime?.id);
  }

  function trySendRuntimeMessage(payload, context) {
    if (!hasRuntime()) return false;
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

  function clearMediaReadyListener() {
    if (typeof state.mediaReadyListenerCleanup === 'function') {
      state.mediaReadyListenerCleanup();
    }
    state.mediaReadyListenerVideo = null;
    state.mediaReadyListenerCleanup = null;
  }

  function isCurrentPageMediaReady() {
    const currentUrl = getCurrentPageUrl();
    return Boolean(currentUrl) && currentUrl === state.mediaReadyUrl;
  }

  function getVideoFingerprint(video) {
    if (!video || typeof video !== 'object') return '';
    const source =
      (typeof video.currentSrc === 'string' && video.currentSrc) ||
      (typeof video.src === 'string' && video.src) ||
      '';
    const duration = config.isFiniteNumber(video.duration)
      ? String(Math.round(video.duration * 1000))
      : '';
    return `${source}|${duration}`;
  }

  function hasFreshMediaEvidence(video, observedFreshMediaEvent) {
    if (observedFreshMediaEvent) return true;
    if (!state.lastMediaReadyVideoElement) return true;
    if (video !== state.lastMediaReadyVideoElement) return true;
    const fingerprint = getVideoFingerprint(video);
    return Boolean(fingerprint) && fingerprint !== state.lastMediaReadyFingerprint;
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
        trySendRuntimeMessage({ type: 'pageVideoDetails', details }, 'page video details');
      }
    } catch (error) {
      logContentError('Sending page video details', error);
    }
  }

  function sendPageRuntimeReady({ force = false } = {}) {
    const currentUrl = getCurrentPageUrl();
    if (!shouldSendPageRuntimeReady(currentUrl, state.runtimeReadyUrl, { force })) return;
    state.runtimeReadyUrl = currentUrl;
    trySendRuntimeMessage({ type: 'pageRuntimeReady' }, 'page runtime ready');
  }

  function attachVideoReadyListener() {
    const video = getPrimaryVideoElement(environment);
    if (!video) return false;
    if (isCurrentPageMediaReady()) return true;
    if (state.mediaReadyListenerVideo === video) return true;

    clearMediaReadyListener();

    const events = ['loadedmetadata', 'loadeddata', 'durationchange', 'canplay'];
    let observedFreshMediaEvent = false;
    const cleanup = () => {
      events.forEach((eventName) => video.removeEventListener(eventName, onAny));
      if (state.mediaReadyListenerVideo === video) {
        state.mediaReadyListenerVideo = null;
        state.mediaReadyListenerCleanup = null;
      }
    };
    const send = () => {
      state.mediaReadyUrl = getCurrentPageUrl();
      state.lastMediaReadyVideoElement = video;
      state.lastMediaReadyFingerprint = getVideoFingerprint(video);
      trySendRuntimeMessage({ type: 'pageMediaReady' }, 'page media ready');
      cleanup();
    };
    const maybeSend = () => {
      if (
        video.readyState >= config.mediaReadyStateThreshold &&
        config.isFiniteNumber(video.duration) &&
        hasFreshMediaEvidence(video, observedFreshMediaEvent) &&
        doesVideoDurationMatchPage(video)
      ) {
        send();
        return true;
      }
      return false;
    };
    const onAny = () => {
      observedFreshMediaEvent = true;
      maybeSend();
    };

    if (maybeSend()) return true;

    events.forEach((eventName) => video.addEventListener(eventName, onAny));
    state.mediaReadyListenerVideo = video;
    state.mediaReadyListenerCleanup = cleanup;
    return true;
  }

  function watchForVideoMount() {
    attachVideoReadyListener();
    if (isCurrentPageMediaReady()) {
      if (state.videoMountObserver) {
        state.videoMountObserver.disconnect();
        state.videoMountObserver = null;
      }
      return;
    }

    const MutationObserverCtor = getMutationObserver();
    const runtimeDocument = getDocument();
    if (!MutationObserverCtor || !runtimeDocument?.documentElement) return;

    if (!state.videoMountObserver) {
      state.videoMountObserver = new MutationObserverCtor(() => {
        attachVideoReadyListener();
        if (isCurrentPageMediaReady()) {
          state.videoMountObserver.disconnect();
          state.videoMountObserver = null;
        }
      });
      state.videoMountObserver.observe(runtimeDocument.documentElement, {
        childList: true,
        subtree: true,
      });
      return;
    }

    attachVideoReadyListener();
    if (isCurrentPageMediaReady()) {
      state.videoMountObserver.disconnect();
      state.videoMountObserver = null;
    }
  }

  function observeTitleElement(titleElement) {
    if (!titleElement || titleElement === state.observedTitleElement) return;
    const shouldSendUpdate = state.observedTitleElement !== null;
    state.observedTitleElement = titleElement;
    state.lastKnownTitleText = titleElement.textContent;

    if (state.titleTextObserver) state.titleTextObserver.disconnect();
    const MutationObserverCtor = getMutationObserver();
    if (!MutationObserverCtor) return;
    state.titleTextObserver = new MutationObserverCtor(() => {
      const nextTitle = titleElement.textContent;
      if (nextTitle === state.lastKnownTitleText) return;
      state.lastKnownTitleText = nextTitle;
      publishPageVideoDetails();
    });
    state.titleTextObserver.observe(titleElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    if (shouldSendUpdate) {
      publishPageVideoDetails();
    }
  }

  function watchTitleChanges() {
    const runtimeDocument = getDocument();
    observeTitleElement(runtimeDocument?.querySelector?.('title'));
    if (state.titleElementObserver) return;

    const target = runtimeDocument?.head || runtimeDocument?.documentElement;
    const MutationObserverCtor = getMutationObserver();
    if (!target || !MutationObserverCtor) return;

    state.titleElementObserver = new MutationObserverCtor(() => {
      observeTitleElement(runtimeDocument.querySelector('title'));
    });
    state.titleElementObserver.observe(target, { childList: true, subtree: true });
  }

  function handleCollectVideoMetrics(message, sendResponse) {
    if (!message || message.type !== 'collectVideoMetrics') return false;

    const video = getPrimaryVideoElement(environment);
    const details = collectPageDetails();
    const payload = {
      title: details.title || null,
      url: details.url,
      pageMediaReady: isCurrentPageMediaReady(),
      lengthSeconds: config.isFiniteNumber(details.lengthSeconds) ? details.lengthSeconds : null,
      isLive: Boolean(details.isLive),
      duration: video && config.isFiniteNumber(video.duration) ? video.duration : null,
      currentTime: video && config.isFiniteNumber(video.currentTime) ? video.currentTime : null,
      playbackRate:
        video && config.isFiniteNumber(video.playbackRate) && video.playbackRate > 0
          ? video.playbackRate
          : 1,
      paused: video ? video.paused : null,
    };
    sendResponse(payload);
    return true;
  }

  function disposeObservers() {
    clearMediaReadyListener();
    if (state.videoMountObserver) {
      state.videoMountObserver.disconnect();
      state.videoMountObserver = null;
    }
    if (state.titleElementObserver) {
      state.titleElementObserver.disconnect();
      state.titleElementObserver = null;
    }
    if (state.titleTextObserver) {
      state.titleTextObserver.disconnect();
      state.titleTextObserver = null;
    }
    state.observedTitleElement = null;
    state.lastKnownTitleText = null;
  }

  function syncPageSession() {
    const currentUrl = getCurrentPageUrl();
    if (currentUrl && currentUrl !== state.observedPageUrl) {
      disposeObservers();
      state.observedPageUrl = currentUrl;
      state.runtimeReadyUrl = null;
      state.mediaReadyUrl = null;
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
    watchForVideoMount();
    watchTitleChanges();
  }

  function reset() {
    disposeObservers();
    state.observedPageUrl = null;
    state.runtimeReadyUrl = null;
    state.mediaReadyUrl = null;
    state.lastMediaReadyVideoElement = null;
    state.lastMediaReadyFingerprint = null;
    state.initialized = false;
  }

  function bootstrap() {
    if (state.initialized) return;
    state.initialized = true;

    if (!hasRuntime()) return;

    const runtimeWindow = getWindow();
    const runtimeDocument = getDocument();
    const runtimeChrome = getChrome();

    runtimeChrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
      handleCollectVideoMetrics(message, sendResponse),
    );

    if (
      runtimeDocument?.readyState === 'complete' ||
      runtimeDocument?.readyState === 'interactive'
    ) {
      refreshPageState({ includeReadySignal: true });
    } else {
      runtimeWindow?.addEventListener(
        'DOMContentLoaded',
        () => refreshPageState({ includeReadySignal: true }),
        { once: true },
      );
    }

    runtimeWindow?.addEventListener('yt-navigate-finish', () => {
      refreshPageState({ includeReadySignal: true });
    });

    runtimeWindow?.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        refreshPageState({ includeReadySignal: true, forceReadySignal: true });
      }
    });

    runtimeWindow?.addEventListener('pagehide', () => {
      disposeObservers();
      state.runtimeReadyUrl = null;
      state.mediaReadyUrl = null;
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

const defaultPageRuntimeSession = createPageRuntimeSession();

export function resetRuntimeStateForTests() {
  defaultPageRuntimeSession.reset();
}

export function bootstrapPageRuntime() {
  defaultPageRuntimeSession.bootstrap();
}
