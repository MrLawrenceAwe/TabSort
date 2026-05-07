import assert from 'node:assert/strict';
import test from 'node:test';

import { createYoutubePageController } from '../content/youtube/youtube-page-controller.js';
import { shouldSendPageReadySignal } from '../content/youtube/youtube-page-controller-state.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    FakeMutationObserver.instances.push(this);
  }

  observe(target, options) {
    this.target = target;
    this.options = options;
  }

  disconnect() {}
}

FakeMutationObserver.instances = [];

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
  let querySelectorAllCount = 0;
  const animationFrameCallbacks = [];

  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.location = { href: 'https://www.youtube.com/watch?v=one' };
  globalThis.window = {
    ...windowTarget,
    innerWidth: 1280,
    innerHeight: 720,
    ytInitialPlayerResponse: null,
    requestAnimationFrame(callback) {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    },
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
      querySelectorAllCount += 1;
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
    getQuerySelectorAllCount() {
      return querySelectorAllCount;
    },
    flushAnimationFrame() {
      const callback = animationFrameCallbacks.shift();
      if (callback) callback();
    },
    documentElement,
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
  FakeMutationObserver.instances = [];
}

test('shouldSendPageReadySignal allows first-load, force-refresh, and URL-change signals', () => {
  assert.equal(
    shouldSendPageReadySignal('https://www.youtube.com/watch?v=one', null),
    true,
  );
  assert.equal(
    shouldSendPageReadySignal(
      'https://www.youtube.com/watch?v=one',
      'https://www.youtube.com/watch?v=one',
    ),
    false,
  );
  assert.equal(
    shouldSendPageReadySignal(
      'https://www.youtube.com/watch?v=one',
      'https://www.youtube.com/watch?v=one',
      { force: true },
    ),
    true,
  );
  assert.equal(
    shouldSendPageReadySignal(
      'https://www.youtube.com/watch?v=two',
      'https://www.youtube.com/watch?v=one',
    ),
    true,
  );
});

test(
  'page runtime session re-sends pageRuntimeReady after yt-navigate-finish changes the page URL',
  () => {
    const runtime = createYoutubePageController();
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
    const runtime = createYoutubePageController();
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
  const runtime = createYoutubePageController();
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

test('page runtime throttles video mount scans during mutation bursts', () => {
  const runtime = createYoutubePageController();
  try {
    const dom = installRuntimeTestDom();
    dom.replaceVideos([]);

    runtime.bootstrap();

    const scanCountAfterBootstrap = dom.getQuerySelectorAllCount();
    const observer = FakeMutationObserver.instances.find(
      (instance) => instance.target === dom.documentElement,
    );
    assert.ok(observer);

    const addedNode = {
      nodeType: 1,
      tagName: 'div',
      querySelector: (selector) => (selector === 'video' ? {} : null),
    };
    observer.callback([{ target: addedNode, addedNodes: [addedNode] }]);
    observer.callback([{ target: addedNode, addedNodes: [addedNode] }]);
    observer.callback([{ target: addedNode, addedNodes: [addedNode] }]);

    assert.equal(dom.getQuerySelectorAllCount(), scanCountAfterBootstrap);

    dom.replaceVideos([
      createFakeVideo({
        readyState: 3,
        duration: 120,
        currentSrc: 'blob:video-one',
      }),
    ]);
    dom.flushAnimationFrame();

    assert.equal(dom.getQuerySelectorAllCount(), scanCountAfterBootstrap + 1);
  } finally {
    runtime.reset();
    resetGlobals();
  }
});
