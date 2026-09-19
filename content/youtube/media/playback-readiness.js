import { isFiniteNumber } from '../../../shared/guards.js';
import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../../../shared/messages.js';
import { getPrimaryVideoElement } from './elements.js';

export function createPlaybackReadinessTracker({
  config,
  environment,
  getCurrentPageUrl,
  getDocument,
  getMutationObserver,
  sendExtensionMessage,
  doesMediaMatchPageMetadata,
}) {
  const state = {
    videoMountObserver: null,
    playbackReadyPageUrl: null,
    lastReadyVideo: null,
    lastReadyFingerprint: null,
    playbackReadyListenerVideo: null,
    playbackReadyListenerCleanup: null,
    videoMountCheckScheduled: false,
    videoMountCheckToken: 0,
  };

  function isCurrentPlaybackReady() {
    const currentUrl = getCurrentPageUrl();
    return Boolean(currentUrl) && currentUrl === state.playbackReadyPageUrl;
  }

  function getVideoFingerprint(video) {
    if (!video || typeof video !== 'object') return '';
    const source =
      (typeof video.currentSrc === 'string' && video.currentSrc) ||
      (typeof video.src === 'string' && video.src) ||
      '';
    const duration = isFiniteNumber(video.duration)
      ? String(Math.round(video.duration * 1000))
      : '';
    return `${source}|${duration}`;
  }

  function hasFreshMediaEvidence(video, observedFreshMediaEvent) {
    if (observedFreshMediaEvent) return true;
    if (!state.lastReadyVideo) return true;
    if (video !== state.lastReadyVideo) return true;
    const fingerprint = getVideoFingerprint(video);
    return Boolean(fingerprint) && fingerprint !== state.lastReadyFingerprint;
  }

  function canMarkPlaybackReady(video, observedFreshMediaEvent = false) {
    return (
      video?.readyState >= config.mediaReadyStateThreshold &&
      isFiniteNumber(video.duration) &&
      hasFreshMediaEvidence(video, observedFreshMediaEvent) &&
      doesMediaMatchPageMetadata(video)
    );
  }

  function clearPlaybackReadyListener() {
    if (typeof state.playbackReadyListenerCleanup === 'function') {
      state.playbackReadyListenerCleanup();
    }
    state.playbackReadyListenerVideo = null;
    state.playbackReadyListenerCleanup = null;
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

  function markPlaybackReady(video, { notify = true } = {}) {
    const currentUrl = getCurrentPageUrl();
    if (!currentUrl) return false;
    state.playbackReadyPageUrl = currentUrl;
    state.lastReadyVideo = video;
    state.lastReadyFingerprint = getVideoFingerprint(video);
    if (notify) {
      sendExtensionMessage(
        createRuntimeMessage(RUNTIME_MESSAGE_TYPES.PLAYBACK_METRICS_READY),
        'playback metrics ready',
      );
    }
    if (state.playbackReadyListenerVideo === video) {
      clearPlaybackReadyListener();
    }
    return true;
  }

  function tryMarkPlaybackReady({ notify = true } = {}) {
    if (isCurrentPlaybackReady()) return true;
    const video = getPrimaryVideoElement(environment);
    if (!canMarkPlaybackReady(video)) return false;
    return markPlaybackReady(video, { notify });
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
      attachPlaybackReadyListener();
      if (isCurrentPlaybackReady() && state.videoMountObserver) {
        disposeVideoMountObserver();
      }
    });
  }

  function attachPlaybackReadyListener() {
    const video = getPrimaryVideoElement(environment);
    if (!video) return false;
    if (isCurrentPlaybackReady()) return true;
    if (canMarkPlaybackReady(video)) return markPlaybackReady(video);
    if (state.playbackReadyListenerVideo === video) return true;

    clearPlaybackReadyListener();

    const events = ['loadedmetadata', 'loadeddata', 'durationchange', 'canplay'];
    let observedFreshMediaEvent = false;
    const cleanup = () => {
      events.forEach((eventName) => video.removeEventListener(eventName, onMediaReadyEvent));
      if (state.playbackReadyListenerVideo === video) {
        state.playbackReadyListenerVideo = null;
        state.playbackReadyListenerCleanup = null;
      }
    };
    const tryMarkPlaybackReady = () => {
      if (canMarkPlaybackReady(video, observedFreshMediaEvent)) {
        markPlaybackReady(video);
        return true;
      }
      return false;
    };
    const onMediaReadyEvent = () => {
      observedFreshMediaEvent = true;
      tryMarkPlaybackReady();
    };

    if (tryMarkPlaybackReady()) return true;

    events.forEach((eventName) => video.addEventListener(eventName, onMediaReadyEvent));
    state.playbackReadyListenerVideo = video;
    state.playbackReadyListenerCleanup = cleanup;
    return true;
  }

  function watchForVideoMount() {
    attachPlaybackReadyListener();
    if (isCurrentPlaybackReady()) {
      disposeVideoMountObserver();
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
    }
  }

  function disposeVideoMountObserver() {
    state.videoMountObserver?.disconnect();
    state.videoMountObserver = null;
  }

  function dispose() {
    clearPlaybackReadyListener();
    state.videoMountCheckScheduled = false;
    state.videoMountCheckToken += 1;
    disposeVideoMountObserver();
  }

  function resetForNavigation() {
    dispose();
    state.playbackReadyPageUrl = null;
    // Keep previous media evidence so a reused video element cannot mark the
    // next page ready until its source/duration changes or a fresh event arrives.
  }

  function reset() {
    resetForNavigation();
    state.lastReadyVideo = null;
    state.lastReadyFingerprint = null;
  }

  return {
    dispose,
    resetForNavigation,
    reset,
    isCurrentPlaybackReady,
    tryMarkPlaybackReady,
    watchForVideoMount,
  };
}
