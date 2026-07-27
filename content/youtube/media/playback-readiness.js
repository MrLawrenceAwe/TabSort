import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../../../shared/messages.js';
import { getPrimaryVideoElement } from './elements.js';

export function createPlaybackReadinessTracker({
  config,
  environment,
  state,
  getCurrentPageUrl,
  getDocument,
  getMutationObserver,
  sendExtensionMessage,
  doesMediaMatchPageMetadata,
}) {
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
    const duration = config.isFiniteNumber(video.duration)
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
      config.isFiniteNumber(video.duration) &&
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

  function markCurrentPlaybackReadyIfAvailable({ notify = true } = {}) {
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
        state.videoMountObserver.disconnect();
        state.videoMountObserver = null;
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
      events.forEach((eventName) => video.removeEventListener(eventName, onAny));
      if (state.playbackReadyListenerVideo === video) {
        state.playbackReadyListenerVideo = null;
        state.playbackReadyListenerCleanup = null;
      }
    };
    const maybeSend = () => {
      if (canMarkPlaybackReady(video, observedFreshMediaEvent)) {
        markPlaybackReady(video);
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
    state.playbackReadyListenerVideo = video;
    state.playbackReadyListenerCleanup = cleanup;
    return true;
  }

  function watchForVideoMount() {
    attachPlaybackReadyListener();
    if (isCurrentPlaybackReady()) {
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

    attachPlaybackReadyListener();
    if (isCurrentPlaybackReady()) {
      state.videoMountObserver.disconnect();
      state.videoMountObserver = null;
    }
  }

  function disposePlaybackReadinessObservers() {
    clearPlaybackReadyListener();
    state.videoMountCheckScheduled = false;
    state.videoMountCheckToken += 1;
    if (state.videoMountObserver) {
      state.videoMountObserver.disconnect();
      state.videoMountObserver = null;
    }
  }

  return {
    disposePlaybackReadinessObservers,
    isCurrentPlaybackReady,
    markCurrentPlaybackReadyIfAvailable,
    watchForVideoMount,
  };
}
