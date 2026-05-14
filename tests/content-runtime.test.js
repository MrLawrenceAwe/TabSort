import assert from 'node:assert/strict';
import test from 'node:test';

import { createYoutubePageController } from '../content/youtube/controller.js';
import { shouldSendContentScriptReadySignal } from '../content/youtube/controller-state.js';
import { collectPageVideoDetails } from '../content/youtube/video-details.js';
import { inferIsLiveNow } from '../content/youtube/live-status.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import {
  FakeMutationObserver,
  createFakeVideo,
  installRuntimeTestDom,
  resetGlobals,
} from './helpers/content-runtime-fixtures.js';
test('shouldSendContentScriptReadySignal allows first-load, force-refresh, and URL-change signals', () => {
  assert.equal(
    shouldSendContentScriptReadySignal('https://www.youtube.com/watch?v=one', null),
    true,
  );
  assert.equal(
    shouldSendContentScriptReadySignal(
      'https://www.youtube.com/watch?v=one',
      'https://www.youtube.com/watch?v=one',
    ),
    false,
  );
  assert.equal(
    shouldSendContentScriptReadySignal(
      'https://www.youtube.com/watch?v=one',
      'https://www.youtube.com/watch?v=one',
      { force: true },
    ),
    true,
  );
  assert.equal(
    shouldSendContentScriptReadySignal(
      'https://www.youtube.com/watch?v=two',
      'https://www.youtube.com/watch?v=one',
    ),
    true,
  );
});

test(
  'content script session re-sends contentScriptReported after yt-navigate-finish changes the page URL',
  () => {
    const runtime = createYoutubePageController();
    try {
      const { windowTarget, updatePage } = installRuntimeTestDom();

      runtime.bootstrap();

      const initialReadySignals = installRuntimeTestDom.messages.filter(
        (message) => message?.type === RUNTIME_MESSAGE_TYPES.CONTENT_SCRIPT_READY,
      );
      assert.equal(initialReadySignals.length, 1);

      updatePage({
        href: 'https://www.youtube.com/watch?v=two',
        title: 'Video Two - YouTube',
        duration: 'PT3M0S',
      });
      windowTarget.dispatch('yt-navigate-finish');

      const readySignalsAfterNavigation = installRuntimeTestDom.messages.filter(
        (message) => message?.type === RUNTIME_MESSAGE_TYPES.CONTENT_SCRIPT_READY,
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
  'content script session waits for fresh media evidence before re-sending mediaElementObserved on SPA navigation',
  () => {
    const runtime = createYoutubePageController();
    try {
      const { windowTarget, updatePage, video } = installRuntimeTestDom();

      runtime.bootstrap();

      const initialMediaReadySignals = installRuntimeTestDom.messages.filter(
        (message) => message?.type === RUNTIME_MESSAGE_TYPES.VIDEO_ELEMENT_READY,
      );
      assert.equal(initialMediaReadySignals.length, 1);

      updatePage({
        href: 'https://www.youtube.com/watch?v=two',
        title: 'Video Two - YouTube',
        duration: 'PT1M12S',
      });
      windowTarget.dispatch('yt-navigate-finish');

      const mediaReadyAfterNavigation = installRuntimeTestDom.messages.filter(
        (message) => message?.type === RUNTIME_MESSAGE_TYPES.VIDEO_ELEMENT_READY,
      );
      assert.equal(mediaReadyAfterNavigation.length, 1);

      video.currentSrc = 'blob:video-two';
      video.duration = 72;
      video.readyState = 3;
      video.dispatch('loadedmetadata');

      const mediaReadyAfterFreshVideo = installRuntimeTestDom.messages.filter(
        (message) => message?.type === RUNTIME_MESSAGE_TYPES.VIDEO_ELEMENT_READY,
      );
      assert.equal(mediaReadyAfterFreshVideo.length, 2);
    } finally {
      runtime.reset();
      resetGlobals();
    }
  },
);

test(
  'video metric collection self-resolves video readiness when ready events were missed',
  () => {
    const runtime = createYoutubePageController();
    try {
      const { video } = installRuntimeTestDom();
      video.readyState = 0;
      video.duration = NaN;

      runtime.bootstrap();

      const mediaReadyAfterBootstrap = installRuntimeTestDom.messages.filter(
        (message) => message?.type === RUNTIME_MESSAGE_TYPES.VIDEO_ELEMENT_READY,
      );
      assert.equal(mediaReadyAfterBootstrap.length, 0);

      video.readyState = 3;
      video.duration = 120;

      let response = null;
      installRuntimeTestDom.onMessageListener(
        { type: RUNTIME_MESSAGE_TYPES.COLLECT_VIDEO_METRICS },
        {},
        (payload) => {
          response = payload;
        },
      );

      assert.equal(response?.mediaElementObserved, true);

      const mediaReadyAfterMetricCollection = installRuntimeTestDom.messages.filter(
        (message) => message?.type === RUNTIME_MESSAGE_TYPES.VIDEO_ELEMENT_READY,
      );
      assert.equal(mediaReadyAfterMetricCollection.length, 0);
    } finally {
      runtime.reset();
      resetGlobals();
    }
  },
);

test(
  'video metric collection falls back to YouTube player duration for archived streams',
  () => {
    const runtime = createYoutubePageController();
    try {
      const { video, player } = installRuntimeTestDom();
      video.readyState = 3;
      video.duration = Infinity;
      video.currentTime = 0;
      player.duration = 6211;
      player.currentTime = 0;

      runtime.bootstrap();

      let response = null;
      installRuntimeTestDom.onMessageListener(
        { type: RUNTIME_MESSAGE_TYPES.COLLECT_VIDEO_METRICS },
        {},
        (payload) => {
          response = payload;
        },
      );

      assert.equal(response?.mediaElementObserved, false);
      assert.equal(response?.duration, 6211);
      assert.equal(response?.currentTime, 0);
    } finally {
      runtime.reset();
      resetGlobals();
    }
  },
);

test('page video details ignore zero-length YouTube player metadata', () => {
  const environment = {
    location: { href: 'https://www.youtube.com/watch?v=archive' },
    window: {
      ytInitialPlayerResponse: {
        videoDetails: {
          title: 'Archived Stream',
          lengthSeconds: '0',
          isLive: false,
          isLiveContent: false,
        },
        playabilityStatus: {},
      },
    },
    document: {
      title: 'Archived Stream - YouTube',
      scripts: [],
      querySelector(selector) {
        if (selector === 'meta[itemprop="duration"]') {
          return { getAttribute: () => null };
        }
        return null;
      },
    },
  };

  const details = collectPageVideoDetails({
    inferIsLiveNow,
    logContentError() {},
    environment,
  });

  assert.equal(details.lengthSeconds, null);
  assert.equal(details.isLive, false);
});

test('content script session reset removes listeners before a second bootstrap', () => {
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

test('content script throttles video mount scans during mutation bursts', () => {
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
