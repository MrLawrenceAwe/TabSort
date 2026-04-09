import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bootstrapRuntime,
  resetRuntimeStateForTests,
  shouldSendPageRuntimeReady,
} from '../content/youtube/runtime.js';

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
          installRuntimeTestDom.onMessageListener = listener;
        },
      },
    },
  };

  return {
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

function resetGlobals() {
  delete globalThis.MutationObserver;
  delete globalThis.location;
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.chrome;
  installRuntimeTestDom.messages = [];
  installRuntimeTestDom.onMessageListener = null;
}

test('shouldSendPageRuntimeReady allows first-load, force-refresh, and URL-change signals', () => {
  assert.equal(
    shouldSendPageRuntimeReady('https://www.youtube.com/watch?v=one', null),
    true,
  );
  assert.equal(
    shouldSendPageRuntimeReady(
      'https://www.youtube.com/watch?v=one',
      'https://www.youtube.com/watch?v=one',
    ),
    false,
  );
  assert.equal(
    shouldSendPageRuntimeReady(
      'https://www.youtube.com/watch?v=one',
      'https://www.youtube.com/watch?v=one',
      { force: true },
    ),
    true,
  );
  assert.equal(
    shouldSendPageRuntimeReady(
      'https://www.youtube.com/watch?v=two',
      'https://www.youtube.com/watch?v=one',
    ),
    true,
  );
});

test(
  'bootstrapRuntime re-sends pageRuntimeReady after yt-navigate-finish changes the page URL',
  { concurrency: false },
  () => {
    resetRuntimeStateForTests();
    try {
      const { windowTarget, updatePage } = installRuntimeTestDom();

      bootstrapRuntime();

      const initialReadySignals = installRuntimeTestDom.messages.filter(
        (message) => message?.type === 'pageRuntimeReady',
      );
      assert.equal(initialReadySignals.length, 1);

      updatePage({
        href: 'https://www.youtube.com/watch?v=two',
        title: 'Video Two - YouTube',
        duration: 'PT3M0S',
      });
      windowTarget.dispatch('yt-navigate-finish');

      const readySignalsAfterNavigation = installRuntimeTestDom.messages.filter(
        (message) => message?.type === 'pageRuntimeReady',
      );
      assert.equal(readySignalsAfterNavigation.length, 2);

      const detailSignals = installRuntimeTestDom.messages.filter(
        (message) => message?.type === 'pageVideoDetails',
      );
      assert.equal(detailSignals.at(-1)?.details?.url, 'https://www.youtube.com/watch?v=two');
    } finally {
      resetRuntimeStateForTests();
      resetGlobals();
    }
  },
);

test(
  'bootstrapRuntime waits for fresh media evidence before re-sending pageMediaReady on SPA navigation',
  { concurrency: false },
  () => {
    resetRuntimeStateForTests();
    try {
      const { windowTarget, updatePage, video } = installRuntimeTestDom();

      bootstrapRuntime();

      const initialMediaReadySignals = installRuntimeTestDom.messages.filter(
        (message) => message?.type === 'pageMediaReady',
      );
      assert.equal(initialMediaReadySignals.length, 1);

      updatePage({
        href: 'https://www.youtube.com/watch?v=two',
        title: 'Video Two - YouTube',
        duration: 'PT1M12S',
      });
      windowTarget.dispatch('yt-navigate-finish');

      const mediaReadyAfterNavigation = installRuntimeTestDom.messages.filter(
        (message) => message?.type === 'pageMediaReady',
      );
      assert.equal(mediaReadyAfterNavigation.length, 1);

      video.currentSrc = 'blob:video-two';
      video.duration = 72;
      video.readyState = 3;
      video.dispatch('loadedmetadata');

      const mediaReadyAfterFreshVideo = installRuntimeTestDom.messages.filter(
        (message) => message?.type === 'pageMediaReady',
      );
      assert.equal(mediaReadyAfterFreshVideo.length, 2);
    } finally {
      resetRuntimeStateForTests();
      resetGlobals();
    }
  },
);
