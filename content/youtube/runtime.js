import { MEDIA_READY_STATE_THRESHOLD } from '../../shared/constants.js';
import { inferIsLiveNow } from './live-status.js';
import { isFiniteNumber } from '../../shared/guards.js';
import { collectPageVideoDetails, getPrimaryVideoElement } from './metadata.js';

const runtimeConfig = {
  mediaReadyStateThreshold: MEDIA_READY_STATE_THRESHOLD,
  isFiniteNumber,
  inferIsLiveNow,
};

let videoMountObserver = null;
let titleElementObserver = null;
let titleTextObserver = null;
let observedTitleElement = null;
let lastKnownTitleText = null;
let observedPageUrl = null;
let runtimeReadyUrl = null;
let mediaReadyUrl = null;
let lastMediaReadyVideoElement = null;
let lastMediaReadyFingerprint = null;
let mediaReadyListenerVideo = null;
let mediaReadyListenerCleanup = null;

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

function getCurrentPageUrl() {
  return globalThis.location?.href || '';
}

function clearMediaReadyListener() {
  if (typeof mediaReadyListenerCleanup === 'function') {
    mediaReadyListenerCleanup();
  }
  mediaReadyListenerVideo = null;
  mediaReadyListenerCleanup = null;
}

function isCurrentPageMediaReady() {
  const currentUrl = getCurrentPageUrl();
  return Boolean(currentUrl) && currentUrl === mediaReadyUrl;
}

function getVideoFingerprint(video) {
  if (!video || typeof video !== 'object') return '';
  const source =
    (typeof video.currentSrc === 'string' && video.currentSrc) ||
    (typeof video.src === 'string' && video.src) ||
    '';
  const duration = runtimeConfig.isFiniteNumber(video.duration)
    ? String(Math.round(video.duration * 1000))
    : '';
  return `${source}|${duration}`;
}

function hasFreshMediaEvidence(video, observedFreshMediaEvent) {
  if (observedFreshMediaEvent) return true;
  if (!lastMediaReadyVideoElement) return true;
  if (video !== lastMediaReadyVideoElement) return true;
  const fingerprint = getVideoFingerprint(video);
  return Boolean(fingerprint) && fingerprint !== lastMediaReadyFingerprint;
}

function doesVideoDurationMatchPage(video) {
  if (!video || !runtimeConfig.isFiniteNumber(video.duration)) {
    return false;
  }
  const details = collectPageDetails();
  if (!runtimeConfig.isFiniteNumber(details.lengthSeconds)) {
    return true;
  }
  return Math.abs(video.duration - details.lengthSeconds) <= 2;
}

export function shouldSendPageRuntimeReady(currentUrl, lastReadyUrl, { force = false } = {}) {
  return Boolean(currentUrl) && (force || currentUrl !== lastReadyUrl);
}

function collectPageDetails() {
  return collectPageVideoDetails({
    inferIsLiveNow: runtimeConfig.inferIsLiveNow,
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

function sendPageRuntimeReady({ force = false } = {}) {
  const currentUrl = getCurrentPageUrl();
  if (!shouldSendPageRuntimeReady(currentUrl, runtimeReadyUrl, { force })) return;
  runtimeReadyUrl = currentUrl;
  trySendRuntimeMessage({ type: 'pageRuntimeReady' }, 'page runtime ready');
}

function attachVideoReadyListener() {
  const video = getPrimaryVideoElement();
  if (!video) return false;
  if (isCurrentPageMediaReady()) return true;
  if (mediaReadyListenerVideo === video) return true;

  clearMediaReadyListener();

  const events = ['loadedmetadata', 'loadeddata', 'durationchange', 'canplay'];
  let observedFreshMediaEvent = false;
  const cleanup = () => {
    events.forEach((eventName) => video.removeEventListener(eventName, onAny));
    if (mediaReadyListenerVideo === video) {
      mediaReadyListenerVideo = null;
      mediaReadyListenerCleanup = null;
    }
  };
  const send = () => {
    mediaReadyUrl = getCurrentPageUrl();
    lastMediaReadyVideoElement = video;
    lastMediaReadyFingerprint = getVideoFingerprint(video);
    trySendRuntimeMessage({ type: 'pageMediaReady' }, 'page media ready');
    cleanup();
  };
  const maybeSend = () => {
    if (
      video.readyState >= runtimeConfig.mediaReadyStateThreshold &&
      runtimeConfig.isFiniteNumber(video.duration) &&
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
  mediaReadyListenerVideo = video;
  mediaReadyListenerCleanup = cleanup;
  return true;
}

function watchForVideoMount() {
  attachVideoReadyListener();
  if (isCurrentPageMediaReady()) {
    if (videoMountObserver) {
      videoMountObserver.disconnect();
      videoMountObserver = null;
    }
    return;
  }
  if (!videoMountObserver) {
    videoMountObserver = new MutationObserver(() => {
      attachVideoReadyListener();
      if (isCurrentPageMediaReady()) {
        videoMountObserver.disconnect();
        videoMountObserver = null;
      }
    });
    videoMountObserver.observe(document.documentElement, { childList: true, subtree: true });
  } else {
    attachVideoReadyListener();
    if (isCurrentPageMediaReady()) {
      videoMountObserver.disconnect();
      videoMountObserver = null;
    }
  }
}

function observeTitleElement(titleElement) {
  if (!titleElement || titleElement === observedTitleElement) return;
  const shouldSendUpdate = observedTitleElement !== null;
  observedTitleElement = titleElement;
  lastKnownTitleText = titleElement.textContent;

  if (titleTextObserver) titleTextObserver.disconnect();
  titleTextObserver = new MutationObserver(() => {
    const nextTitle = titleElement.textContent;
    if (nextTitle === lastKnownTitleText) return;
    lastKnownTitleText = nextTitle;
    publishPageVideoDetails();
  });
  titleTextObserver.observe(titleElement, { childList: true, characterData: true, subtree: true });

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
    pageMediaReady: isCurrentPageMediaReady(),
    lengthSeconds: runtimeConfig.isFiniteNumber(details.lengthSeconds) ? details.lengthSeconds : null,
    isLive: Boolean(details.isLive),
    duration: video && runtimeConfig.isFiniteNumber(video.duration) ? video.duration : null,
    currentTime: video && runtimeConfig.isFiniteNumber(video.currentTime) ? video.currentTime : null,
    playbackRate:
      video && runtimeConfig.isFiniteNumber(video.playbackRate) && video.playbackRate > 0
        ? video.playbackRate
        : 1,
    paused: video ? video.paused : null,
  };
  sendResponse(payload);
  return true;
}

function disposeObservers() {
  clearMediaReadyListener();
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

function syncPageSession() {
  const currentUrl = getCurrentPageUrl();
  if (currentUrl && currentUrl !== observedPageUrl) {
    disposeObservers();
    observedPageUrl = currentUrl;
    runtimeReadyUrl = null;
    mediaReadyUrl = null;
  } else if (!observedPageUrl && currentUrl) {
    observedPageUrl = currentUrl;
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

export function resetRuntimeStateForTests() {
  disposeObservers();
  observedPageUrl = null;
  runtimeReadyUrl = null;
  mediaReadyUrl = null;
  lastMediaReadyVideoElement = null;
  lastMediaReadyFingerprint = null;
  bootstrapRuntime.initialized = false;
}

export function bootstrapRuntime() {
  if (bootstrapRuntime.initialized) return;
  bootstrapRuntime.initialized = true;

  if (!hasRuntime()) return;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
    handleCollectVideoMetrics(message, sendResponse),
  );

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    refreshPageState({ includeReadySignal: true });
  } else {
    window.addEventListener(
      'DOMContentLoaded',
      () => refreshPageState({ includeReadySignal: true }),
      { once: true },
    );
  }

  window.addEventListener('yt-navigate-finish', () => {
    refreshPageState({ includeReadySignal: true });
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      refreshPageState({ includeReadySignal: true, forceReadySignal: true });
    }
  });

  window.addEventListener('pagehide', () => {
    disposeObservers();
    runtimeReadyUrl = null;
    mediaReadyUrl = null;
    lastMediaReadyVideoElement = null;
    lastMediaReadyFingerprint = null;
  });
}
