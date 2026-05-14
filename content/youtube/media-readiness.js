import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { getPrimaryVideoElement } from './media-elements.js';

export function createMediaReadinessTracker({
  config,
  environment,
  state,
  getCurrentPageUrl,
  getDocument,
  getMutationObserver,
  sendExtensionMessage,
  doesVideoDurationMatchPage,
}) {
  function isCurrentVideoElementReady() {
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
    if (!state.lastReadyVideo) return true;
    if (video !== state.lastReadyVideo) return true;
    const fingerprint = getVideoFingerprint(video);
    return Boolean(fingerprint) && fingerprint !== state.lastMediaReadyFingerprint;
  }

  function canMarkVideoElementReady(video, observedFreshMediaEvent = false) {
    return (
      video?.readyState >= config.mediaReadyStateThreshold &&
      config.isFiniteNumber(video.duration) &&
      hasFreshMediaEvidence(video, observedFreshMediaEvent) &&
      doesVideoDurationMatchPage(video)
    );
  }

  function clearMediaReadyListener() {
    if (typeof state.mediaReadyListenerCleanup === 'function') {
      state.mediaReadyListenerCleanup();
    }
    state.mediaReadyListenerVideo = null;
    state.mediaReadyListenerCleanup = null;
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

  function markVideoElementReady(video, { notify = true } = {}) {
    const currentUrl = getCurrentPageUrl();
    if (!currentUrl) return false;
    state.mediaReadyUrl = currentUrl;
    state.lastReadyVideo = video;
    state.lastMediaReadyFingerprint = getVideoFingerprint(video);
    if (notify) {
      sendExtensionMessage(
        createRuntimeMessage(RUNTIME_MESSAGE_TYPES.VIDEO_ELEMENT_READY),
        'video element ready',
      );
    }
    if (state.mediaReadyListenerVideo === video) {
      clearMediaReadyListener();
    }
    return true;
  }

  function markCurrentVideoElementReadyIfAvailable({ notify = true } = {}) {
    if (isCurrentVideoElementReady()) return true;
    const video = getPrimaryVideoElement(environment);
    if (!canMarkVideoElementReady(video)) return false;
    return markVideoElementReady(video, { notify });
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
      attachVideoReadyListener();
      if (isCurrentVideoElementReady() && state.videoMountObserver) {
        state.videoMountObserver.disconnect();
        state.videoMountObserver = null;
      }
    });
  }

  function attachVideoReadyListener() {
    const video = getPrimaryVideoElement(environment);
    if (!video) return false;
    if (isCurrentVideoElementReady()) return true;
    if (canMarkVideoElementReady(video)) return markVideoElementReady(video);
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
    const maybeSend = () => {
      if (canMarkVideoElementReady(video, observedFreshMediaEvent)) {
        markVideoElementReady(video);
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
    if (isCurrentVideoElementReady()) {
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

    attachVideoReadyListener();
    if (isCurrentVideoElementReady()) {
      state.videoMountObserver.disconnect();
      state.videoMountObserver = null;
    }
  }

  function disposeMediaObservers() {
    clearMediaReadyListener();
    state.videoMountCheckScheduled = false;
    state.videoMountCheckToken += 1;
    if (state.videoMountObserver) {
      state.videoMountObserver.disconnect();
      state.videoMountObserver = null;
    }
  }

  return {
    disposeMediaObservers,
    getVideoFingerprint,
    isCurrentVideoElementReady,
    markCurrentVideoElementReadyIfAvailable,
    watchForVideoMount,
  };
}
