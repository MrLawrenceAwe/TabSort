import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { getPrimaryVideoElement } from './video-details.js';

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
  function isCurrentPageMediaReady() {
    const currentUrl = getCurrentPageUrl();
    return Boolean(currentUrl) && currentUrl === state.mediaReadyPageUrl;
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

  function clearMediaReadyListener() {
    if (typeof state.mediaReadyListenerCleanup === 'function') {
      state.mediaReadyListenerCleanup();
    }
    state.mediaReadyListenerVideo = null;
    state.mediaReadyListenerCleanup = null;
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
      state.mediaReadyPageUrl = getCurrentPageUrl();
      state.lastMediaReadyVideoElement = video;
      state.lastMediaReadyFingerprint = getVideoFingerprint(video);
      sendExtensionMessage(
        createRuntimeMessage(RUNTIME_MESSAGE_TYPES.PAGE_MEDIA_READY),
        'page media ready',
      );
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

  function disposeMediaObservers() {
    clearMediaReadyListener();
    if (state.videoMountObserver) {
      state.videoMountObserver.disconnect();
      state.videoMountObserver = null;
    }
  }

  return {
    disposeMediaObservers,
    getVideoFingerprint,
    isCurrentPageMediaReady,
    watchForVideoMount,
  };
}
