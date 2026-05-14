import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { getPrimaryVideoElement } from './media-elements.js';

export function createVideoMetricsReadinessTracker({
  config,
  environment,
  state,
  getCurrentPageUrl,
  getDocument,
  getMutationObserver,
  sendExtensionMessage,
  doesVideoDurationMatchPage,
}) {
  function isCurrentVideoMetricsReady() {
    const currentUrl = getCurrentPageUrl();
    return Boolean(currentUrl) && currentUrl === state.metricsReadyPageUrl;
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
    if (!state.lastMetricsReadyVideo) return true;
    if (video !== state.lastMetricsReadyVideo) return true;
    const fingerprint = getVideoFingerprint(video);
    return Boolean(fingerprint) && fingerprint !== state.lastMetricsReadyFingerprint;
  }

  function canMarkVideoMetricsReady(video, observedFreshMediaEvent = false) {
    return (
      video?.readyState >= config.mediaReadyStateThreshold &&
      config.isFiniteNumber(video.duration) &&
      hasFreshMediaEvidence(video, observedFreshMediaEvent) &&
      doesVideoDurationMatchPage(video)
    );
  }

  function clearVideoMetricsReadyListener() {
    if (typeof state.videoMetricsReadyListenerCleanup === 'function') {
      state.videoMetricsReadyListenerCleanup();
    }
    state.videoMetricsReadyListenerVideo = null;
    state.videoMetricsReadyListenerCleanup = null;
  }

  function nodeMayContainVideo(node) {
    if (!node || node.nodeType !== 1) return false;
    if (String(node.tagName || '').toLowerCase() === 'video') return true;
    return Boolean(node.querySelector?.('video'));
  }

  function mutationsMayContainVideo(mutations = []) {
    if (!Array.isArray(mutations) || mutations.length === 0) return true;
    return mutations.some((mutation) => {
      if (nodeMayContainVideo(mutation.target)) return true;
      return Array.from(mutation.addedNodes || []).some(nodeMayContainVideo);
    });
  }

  function markVideoMetricsReady(video, { notify = true } = {}) {
    const currentUrl = getCurrentPageUrl();
    if (!currentUrl) return false;
    state.metricsReadyPageUrl = currentUrl;
    state.lastMetricsReadyVideo = video;
    state.lastMetricsReadyFingerprint = getVideoFingerprint(video);
    if (notify) {
      sendExtensionMessage(
        createRuntimeMessage(RUNTIME_MESSAGE_TYPES.VIDEO_ELEMENT_READY),
        'video element ready',
      );
    }
    if (state.videoMetricsReadyListenerVideo === video) {
      clearVideoMetricsReadyListener();
    }
    return true;
  }

  function markCurrentVideoMetricsReadyIfAvailable({ notify = true } = {}) {
    if (isCurrentVideoMetricsReady()) return true;
    const video = getPrimaryVideoElement(environment);
    if (!canMarkVideoMetricsReady(video)) return false;
    return markVideoMetricsReady(video, { notify });
  }

  function requestVideoMountCheck() {
    if (state.videoMountCheckScheduled) return;
    state.videoMountCheckScheduled = true;
    state.videoMountCheckToken += 1;
    const scheduledToken = state.videoMountCheckToken;
    const runtimeWindow = environment.window ?? globalThis.window;
    const schedule =
      typeof runtimeWindow?.requestAnimationFrame === 'function'
        ? runtimeWindow.requestAnimationFrame.bind(runtimeWindow)
        : (callback) => setTimeout(callback, 0);

    schedule(() => {
      if (scheduledToken !== state.videoMountCheckToken) return;
      state.videoMountCheckScheduled = false;
      attachVideoMetricsReadyListener();
      if (isCurrentVideoMetricsReady() && state.videoMountObserver) {
        state.videoMountObserver.disconnect();
        state.videoMountObserver = null;
      }
    });
  }

  function attachVideoMetricsReadyListener() {
    const video = getPrimaryVideoElement(environment);
    if (!video) return false;
    if (isCurrentVideoMetricsReady()) return true;
    if (canMarkVideoMetricsReady(video)) return markVideoMetricsReady(video);
    if (state.videoMetricsReadyListenerVideo === video) return true;

    clearVideoMetricsReadyListener();

    const events = ['loadedmetadata', 'loadeddata', 'durationchange', 'canplay'];
    let observedFreshMediaEvent = false;
    const cleanup = () => {
      events.forEach((eventName) => video.removeEventListener(eventName, onAny));
      if (state.videoMetricsReadyListenerVideo === video) {
        state.videoMetricsReadyListenerVideo = null;
        state.videoMetricsReadyListenerCleanup = null;
      }
    };
    const maybeSend = () => {
      if (canMarkVideoMetricsReady(video, observedFreshMediaEvent)) {
        markVideoMetricsReady(video);
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
    state.videoMetricsReadyListenerVideo = video;
    state.videoMetricsReadyListenerCleanup = cleanup;
    return true;
  }

  function watchForVideoMount() {
    attachVideoMetricsReadyListener();
    if (isCurrentVideoMetricsReady()) {
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
      state.videoMountObserver = new MutationObserverCtor((mutations) => {
        if (!mutationsMayContainVideo(mutations)) return;
        requestVideoMountCheck();
      });
      state.videoMountObserver.observe(runtimeDocument.documentElement, {
        childList: true,
        subtree: true,
      });
      return;
    }

    attachVideoMetricsReadyListener();
    if (isCurrentVideoMetricsReady()) {
      state.videoMountObserver.disconnect();
      state.videoMountObserver = null;
    }
  }

  function disposeVideoMetricsReadinessObservers() {
    clearVideoMetricsReadyListener();
    state.videoMountCheckScheduled = false;
    state.videoMountCheckToken += 1;
    if (state.videoMountObserver) {
      state.videoMountObserver.disconnect();
      state.videoMountObserver = null;
    }
  }

  return {
    disposeVideoMetricsReadinessObservers,
    getVideoFingerprint,
    isCurrentVideoMetricsReady,
    markCurrentVideoMetricsReadyIfAvailable,
    watchForVideoMount,
  };
}
