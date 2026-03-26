import { MEDIA_READY_STATE_THRESHOLD } from '../shared/constants.js';
import { inferIsLiveNow } from '../shared/live-detection.js';
import { isFiniteNumber } from '../shared/utils.js';
import { getTabDetailsHint, getVideoEl } from './youtube-page-details.js';

const sharedRuntime = {
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

function safeSendMessage(payload, context) {
  if (!hasRuntime()) return false;
  try {
    chrome.runtime.sendMessage(payload);
    return true;
  } catch (error) {
    if (context) logContentError(`Sending ${context}`, error);
    return false;
  }
}

function getDetailsHint() {
  return getTabDetailsHint({
    inferIsLiveNow: sharedRuntime.inferIsLiveNow,
    logContentError,
  });
}

function sendTabDetailsHint() {
  try {
    const details = getDetailsHint();
    if (details.title || details.lengthSeconds != null || details.isLive) {
      safeSendMessage({ message: 'tabDetailsHint', details }, 'tab details hint');
    }
  } catch (error) {
    logContentError('Sending tab details hint', error);
  }
}

function sendContentReadyOnce() {
  if (sendContentReadyOnce.sent) return;
  sendContentReadyOnce.sent = true;
  safeSendMessage({ message: 'contentScriptReady' }, 'content script ready');
}

function attachVideoReadyListener() {
  const video = getVideoEl();
  if (!video) return false;

  const events = ['loadedmetadata', 'loadeddata', 'durationchange', 'canplay'];
  const cleanup = () => {
    events.forEach((eventName) => video.removeEventListener(eventName, onAny));
  };
  const send = () => {
    safeSendMessage({ message: 'metadataLoaded' }, 'metadata loaded');
    cleanup();
  };
  const onAny = () => send();

  if (
    video.readyState >= sharedRuntime.mediaReadyStateThreshold &&
    sharedRuntime.isFiniteNumber(video.duration)
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
    sendTabDetailsHint();
  });
  titleTextObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });

  if (shouldSendUpdate) {
    sendTabDetailsHint();
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

function handleGetVideoMetrics(message, sendResponse) {
  if (!message || message.message !== 'getVideoMetrics') return false;

  const video = getVideoEl();
  const details = getDetailsHint();
  const payload = {
    title: details.title || null,
    url: details.url,
    lengthSeconds: sharedRuntime.isFiniteNumber(details.lengthSeconds) ? details.lengthSeconds : null,
    isLive: Boolean(details.isLive),
    duration: video && sharedRuntime.isFiniteNumber(video.duration) ? video.duration : null,
    currentTime: video && sharedRuntime.isFiniteNumber(video.currentTime) ? video.currentTime : null,
    playbackRate:
      video && sharedRuntime.isFiniteNumber(video.playbackRate) && video.playbackRate > 0
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

function refreshMetadata(includeReadySignal = false) {
  if (includeReadySignal) {
    sendContentReadyOnce();
  }
  sendTabDetailsHint();
  watchForVideoMount();
  watchTitleChanges();
}

export function bootstrapContentScript() {
  if (bootstrapContentScript.initialized) return;
  bootstrapContentScript.initialized = true;

  if (!hasRuntime()) return;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) =>
    handleGetVideoMetrics(message, sendResponse),
  );

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    refreshMetadata(true);
  } else {
    window.addEventListener('DOMContentLoaded', () => refreshMetadata(true), { once: true });
  }

  window.addEventListener('yt-navigate-finish', () => {
    refreshMetadata();
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      refreshMetadata(true);
    }
  });

  window.addEventListener('pagehide', () => {
    disposeObservers();
  });
}
