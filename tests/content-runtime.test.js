import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPageRuntimeSession,
  shouldSendPageRuntimeReadySignal,
} from '../content/youtube/page-runtime-session.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
  }

  observe() {}

  disconnect() {}
}

function createEventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    dispatch(type, event = {}) {
      const listener = listeners.get(type);
      if (listener) listener(event);
    },
  };
}

function createFakeVideo({
  readyState = 0,
  duration = NaN,
  currentSrc = '',
  src = '',
  paused = false,
  currentTime = 0,
} = {}) {
  const eventTarget = createEventTarget();
  return {
    ...eventTarget,
    readyState,
    duration,
    currentSrc,
    src,
    paused,
    currentTime,
  };
}

function installRuntimeTestDom() {
  const windowTarget = createEventTarget();
  const titleElement = { textContent: 'Video One - YouTube' };
  const headElement = {};
  const documentElement = {};
  let durationContent = 'PT2M0S';
  const video = createFakeVideo({
    readyState: 3,
    duration: 120,
    currentSrc: 'blob:video-one',
  });
  let videos = [video];

  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.location = { href: 'https://www.youtube.com/watch?v=one' };
  globalThis.window = {
    ...windowTarget,
    innerWidth: 1280,
    innerHeight: 720,
    ytInitialPlayerResponse: null,
  };
  globalThis.document = {
    readyState: 'complete',
    title: 'Video One - YouTube',
    head: headElement,
    documentElement,
    scripts: [],
    querySelector(selector) {
      if (selector === 'title') return titleElement;
      if (selector === 'meta[itemprop="duration"]') {
        return { getAttribute: () => durationContent };
      }
      return null;
    },
    querySelectorAll() {
      return videos;
    },
  };
  globalThis.chrome = {
    runtime: {
      id: 'tabsort-test',
      sendMessage(message) {
        installRuntimeTestDom.messages.push(message);
      },
      onMessage: {
        addListener(listener) {
          installRuntimeTestDom.runtimeMessageListeners.add(listener);
          installRuntimeTestDom.onMessageListener = listener;
        },
        removeListener(listener) {
          installRuntimeTestDom.runtimeMessageListeners.delete(listener);
          installRuntimeTestDom.onMessageListener =
            installRuntimeTestDom.runtimeMessageListeners.size > 0
              ? Array.from(installRuntimeTestDom.runtimeMessageListeners).at(-1)
              : null;
        },
      },
    },
  };

  return {
    getRuntimeMessageListenerCount() {
      return installRuntimeTestDom.runtimeMessageListeners.size;
    },
    windowTarget,
    updatePage({ href, title, duration }) {
      globalThis.location.href = href;
      globalThis.document.title = title;
      titleElement.textContent = title;
      durationContent = duration;
    },
    video,
    replaceVideos(nextVideos) {
      videos = nextVideos;
    },
  };
}

installRuntimeTestDom.messages = [];
installRuntimeTestDom.onMessageListener = null;
installRuntimeTestDom.runtimeMessageListeners = new Set();

function resetGlobals() {
  delete globalThis.MutationObserver;
  delete globalThis.location;
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.chrome;
  installRuntimeTestDom.messages = [];
  installRuntimeTestDom.onMessageListener = null;
  installRuntimeTestDom.runtimeMessageListeners = new Set();
}

test('shouldSendPageRuntimeReadySignal allows first-load, force-refresh, and URL-change signals', () => {
  assert.equal(
    shouldSendPageRuntimeReadySignal('https://www.youtube.com/watch?v=one', null),
    true,
  );
  assert.equal(
    shouldSendPageRuntimeReadySignal(
      'https://www.youtube.com/watch?v=one',
      'https://www.youtube.com/watch?v=one',
    ),
    false,
  );
  assert.equal(
    shouldSendPageRuntimeReadySignal(
      'https://www.youtube.com/watch?v=one',
      'https://www.youtube.com/watch?v=one',
      { force: true },
    ),
    true,
  );
  assert.equal(
    shouldSendPageRuntimeReadySignal(
      'https://www.youtube.com/watch?v=two',
      'https://www.youtube.com/watch?v=one',
    ),
    true,
  );
});

test(
  'page runtime session re-sends pageRuntimeReady after yt-navigate-finish changes the page URL',
  () => {
    const runtime = createPageRuntimeSession();
    try {
      const { windowTarget, updatePage } = installRuntimeTestDom();

      runtime.bootstrap();

      const initialReadySignals = installRuntimeTestDom.messages.filter(
        (message) => message?.type === RUNTIME_MESSAGE_TYPES.PAGE_RUNTIME_READY,
      );
      assert.equal(initialReadySignals.length, 1);

      updatePage({
        href: 'https://www.youtube.com/watch?v=two',
        title: 'Video Two - YouTube',
        duration: 'PT3M0S',
      });
      windowTarget.dispatch('yt-navigate-finish');

      const readySignalsAfterNavigation = installRuntimeTestDom.messages.filter(
        (message) => message?.type === RUNTIME_MESSAGE_TYPES.PAGE_RUNTIME_READY,
      );
      assert.equal(readySignalsAfterNavigation.length, 2);

      const detailSignals = installRuntimeTestDom.messages.filter(
        (message) => message?.type === RUNTIME_MESSAGE_TYPES.PAGE_VIDEO_DETAILS,
      );
      assert.equal(detailSignals.at(-1)?.details?.url, 'https://www.youtube.com/watch?v=two');
    } finally {
      runtime.reset();
      resetGlobals();
    }
  },
);

test(
  'page runtime session waits for fresh media evidence before re-sending pageMediaReady on SPA navigation',
  () => {
    const runtime = createPageRuntimeSession();
    try {
      const { windowTarget, updatePage, video } = installRuntimeTestDom();

      runtime.bootstrap();

      const initialMediaReadySignals = installRuntimeTestDom.messages.filter(
        (message) => message?.type === RUNTIME_MESSAGE_TYPES.PAGE_MEDIA_READY,
      );
      assert.equal(initialMediaReadySignals.length, 1);

      updatePage({
        href: 'https://www.youtube.com/watch?v=two',
        title: 'Video Two - YouTube',
        duration: 'PT1M12S',
      });
      windowTarget.dispatch('yt-navigate-finish');

      const mediaReadyAfterNavigation = installRuntimeTestDom.messages.filter(
        (message) => message?.type === RUNTIME_MESSAGE_TYPES.PAGE_MEDIA_READY,
      );
      assert.equal(mediaReadyAfterNavigation.length, 1);

      video.currentSrc = 'blob:video-two';
      video.duration = 72;
      video.readyState = 3;
      video.dispatch('loadedmetadata');

      const mediaReadyAfterFreshVideo = installRuntimeTestDom.messages.filter(
        (message) => message?.type === RUNTIME_MESSAGE_TYPES.PAGE_MEDIA_READY,
      );
      assert.equal(mediaReadyAfterFreshVideo.length, 2);
    } finally {
      runtime.reset();
      resetGlobals();
    }
  },
);

test('page runtime session reset removes listeners before a second bootstrap', () => {
  const runtime = createPageRuntimeSession();
  try {
    const { getRuntimeMessageListenerCount, windowTarget } = installRuntimeTestDom();

    runtime.bootstrap();
    assert.equal(getRuntimeMessageListenerCount(), 1);
    assert.equal(windowTarget.listeners.size, 3);

    runtime.reset();
    assert.equal(getRuntimeMessageListenerCount(), 0);
    assert.equal(windowTarget.listeners.size, 0);

    runtime.bootstrap();
    assert.equal(getRuntimeMessageListenerCount(), 1);
    assert.equal(windowTarget.listeners.size, 3);
  } finally {
    runtime.reset();
    resetGlobals();
  }
});
