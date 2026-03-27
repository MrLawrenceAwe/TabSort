import { MEDIA_READY_STATE_THRESHOLD } from '../shared/constants.js';
import { inferIsLiveNow } from '../shared/live-detection.js';
import { isFiniteNumber } from '../shared/guards.js';
import { collectPageVideoDetails, getPrimaryVideoElement } from './youtube-page-metadata.js';

const contentDeps = {
  mediaReadyStateThreshold: MEDIA_READY_STATE_THRESHOLD,
  isFiniteNumber,
  inferIsLiveNow,
};

let videoMountObserver = null;
let titleElementObserver = null;
let titleTextObserver = null;
let observedTitleElement = null;
let lastKnownTitleText = null;

function logContentError(context, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[TabSort] ${context}: ${message}`);
}

function hasRuntime() {
  return Boolean(globalThis.chrome?.runtime?.id);
}

function trySendRuntimeMessage(payload, context) {
  if (!hasRuntime()) return false;
  try {
    chrome.runtime.sendMessage(payload);
    return true;
  } catch (error) {
    if (context) logContentError(`Sending ${context}`, error);
    return false;
  }
}

function collectPageDetails() {
  return collectPageVideoDetails({
    inferIsLiveNow: contentDeps.inferIsLiveNow,
    logContentError,
  });
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

function sendPageRuntimeReadyOnce() {
  if (sendPageRuntimeReadyOnce.sent) return;
  sendPageRuntimeReadyOnce.sent = true;
  trySendRuntimeMessage({ type: 'pageRuntimeReady' }, 'page runtime ready');
}

function attachVideoReadyListener() {
  const video = getPrimaryVideoElement();
  if (!video) return false;

  const events = ['loadedmetadata', 'loadeddata', 'durationchange', 'canplay'];
  const cleanup = () => {
    events.forEach((eventName) => video.removeEventListener(eventName, onAny));
  };
  const send = () => {
    trySendRuntimeMessage({ type: 'pageMediaReady' }, 'page media ready');
    cleanup();
  };
  const onAny = () => send();

  if (
    video.readyState >= contentDeps.mediaReadyStateThreshold &&
    contentDeps.isFiniteNumber(video.duration)
  ) {
    send();
  } else {
    events.forEach((eventName) => video.addEventListener(eventName, onAny, { once: true }));
  }
  return true;
}

function watchForVideoMount() {
  if (attachVideoReadyListener()) {
    if (videoMountObserver) {
      videoMountObserver.disconnect();
      videoMountObserver = null;
    }
    return;
  }
  if (videoMountObserver) return;
  videoMountObserver = new MutationObserver(() => {
    if (attachVideoReadyListener()) {
      videoMountObserver.disconnect();
      videoMountObserver = null;
    }
  });
  videoMountObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function observeTitleElement(titleEl) {
  if (!titleEl || titleEl === observedTitleElement) return;
  const shouldSendUpdate = observedTitleElement !== null;
  observedTitleElement = titleEl;
  lastKnownTitleText = titleEl.textContent;

  if (titleTextObserver) titleTextObserver.disconnect();
  titleTextObserver = new MutationObserver(() => {
    const nextTitle = titleEl.textContent;
    if (nextTitle === lastKnownTitleText) return;
    lastKnownTitleText = nextTitle;
    publishPageVideoDetails();
  });
  titleTextObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });

  if (shouldSendUpdate) {
    publishPageVideoDetails();
  }
}

function watchTitleChanges() {
  observeTitleElement(document.querySelector('title'));
  if (titleElementObserver) return;
  const target = document.head || document.documentElement;
  if (!target) return;
  titleElementObserver = new MutationObserver(() => {
    observeTitleElement(document.querySelector('title'));
  });
  titleElementObserver.observe(target, { childList: true, subtree: true });
}

function handleCollectVideoMetrics(message, sendResponse) {
  if (!message || message.type !== 'collectVideoMetrics') return false;

  const video = getPrimaryVideoElement();
  const details = collectPageDetails();
  const payload = {
    title: details.title || null,
    url: details.url,
    lengthSeconds: contentDeps.isFiniteNumber(details.lengthSeconds) ? details.lengthSeconds : null,
    isLive: Boolean(details.isLive),
    duration: video && contentDeps.isFiniteNumber(video.duration) ? video.duration : null,
    currentTime: video && contentDeps.isFiniteNumber(video.currentTime) ? video.currentTime : null,
    playbackRate:
      video && contentDeps.isFiniteNumber(video.playbackRate) && video.playbackRate > 0
        ? video.playbackRate
        : 1,
    paused: video ? video.paused : null,
  };
  sendResponse(payload);
  return true;
}

function disposeObservers() {
  if (videoMountObserver) {
    videoMountObserver.disconnect();
    videoMountObserver = null;
  }
  if (titleElementObserver) {
    titleElementObserver.disconnect();
    titleElementObserver = null;
  }
  if (titleTextObserver) {
    titleTextObserver.disconnect();
    titleTextObserver = null;
  }
  observedTitleElement = null;
  lastKnownTitleText = null;
}

function refreshPageState(includeReadySignal = false) {
  if (includeReadySignal) {
    sendPageRuntimeReadyOnce();
  }
  publishPageVideoDetails();
  watchForVideoMount();
  watchTitleChanges();
}

export function bootstrapYoutubePageRuntime() {
  if (bootstrapYoutubePageRuntime.initialized) return;
  bootstrapYoutubePageRuntime.initialized = true;

  if (!hasRuntime()) return;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
    handleCollectVideoMetrics(message, sendResponse),
  );

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    refreshPageState(true);
  } else {
    window.addEventListener('DOMContentLoaded', () => refreshPageState(true), { once: true });
  }

  window.addEventListener('yt-navigate-finish', () => {
    refreshPageState();
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      refreshPageState(true);
    }
  });

  window.addEventListener('pagehide', () => {
    disposeObservers();
  });
}
