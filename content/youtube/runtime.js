import { MEDIA_READY_STATE_THRESHOLD } from '../../shared/constants.js';
import { inferIsLiveNow } from '../../shared/live-detection.js';
import { isFiniteNumber } from '../../shared/guards.js';
import { collectPageVideoDetails, getPrimaryVideoElement } from './metadata.js';

const runtimeDeps = {
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

function isCurrentPageMediaReady() {
  const currentUrl = getCurrentPageUrl();
  return Boolean(currentUrl) && currentUrl === mediaReadyUrl;
}

export function shouldSendPageRuntimeReady(currentUrl, lastReadyUrl, { force = false } = {}) {
  return Boolean(currentUrl) && (force || currentUrl !== lastReadyUrl);
}

function collectPageDetails() {
  return collectPageVideoDetails({
    inferIsLiveNow: runtimeDeps.inferIsLiveNow,
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

  const events = ['loadedmetadata', 'loadeddata', 'durationchange', 'canplay'];
  const cleanup = () => {
    events.forEach((eventName) => video.removeEventListener(eventName, onAny));
  };
  const send = () => {
    mediaReadyUrl = getCurrentPageUrl();
    trySendRuntimeMessage({ type: 'pageMediaReady' }, 'page media ready');
    cleanup();
  };
  const onAny = () => send();

  if (
    video.readyState >= runtimeDeps.mediaReadyStateThreshold &&
    runtimeDeps.isFiniteNumber(video.duration)
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
    lengthSeconds: runtimeDeps.isFiniteNumber(details.lengthSeconds) ? details.lengthSeconds : null,
    isLive: Boolean(details.isLive),
    duration: video && runtimeDeps.isFiniteNumber(video.duration) ? video.duration : null,
    currentTime: video && runtimeDeps.isFiniteNumber(video.currentTime) ? video.currentTime : null,
    playbackRate:
      video && runtimeDeps.isFiniteNumber(video.playbackRate) && video.playbackRate > 0
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
  });
}
