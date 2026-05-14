import assert from 'node:assert/strict';
import test from 'node:test';

import { trackedWindowState } from '../../background/window-store.js';
import {
  refreshTabPlaybackMetrics,
  refreshTabPlaybackMetricsBatch,
} from '../../background/playback-metrics-refresher.js';
import {
  ensureChromeApi,
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedTabRecords,
  setTrackedTabRecord,
  stubChromeTabMetrics,
} from '../helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test(
  'refreshTabPlaybackMetrics applies updates to the latest record object after async boundaries',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    const initialRecord = createTabRecordFixture(1, { pageRuntimeReady: false });
    setTrackedTabRecords({ 1: initialRecord });

    globalThis.chrome.tabs.get = (_tabId, callback) => {
      setTimeout(() => {
        callback({
          id: 1,
          windowId: 1,
          url: 'https://www.youtube.com/watch?v=1',
          active: false,
          hidden: false,
        });
      }, 0);
    };

    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      setTimeout(() => {
        callback({
          title: 'Video 1',
          url: 'https://www.youtube.com/watch?v=1',
          pageMediaReady: true,
          lengthSeconds: 120,
          currentTime: 20,
          playbackRate: 1,
          paused: false,
          isLive: false,
        });
      }, 0);
    };

    const refreshPromise = refreshTabPlaybackMetrics(1);

    const replacementRecord = createTabRecordFixture(1, { pageRuntimeReady: false });
    setTrackedTabRecords({ 1: replacementRecord });

    await refreshPromise;

    assert.equal(trackedWindowState.tabRecordsById[1], replacementRecord);
    assert.equal(replacementRecord.pageRuntimeReady, true);
    assert.equal(replacementRecord.videoDetails.lengthSeconds, 120);
    assert.equal(replacementRecord.videoDetails.remainingTime, 100);
    assert.equal(replacementRecord.isRemainingTimeStale, false);
  },
);

test(
  'refreshTabPlaybackMetrics updates the stored URL when collected metrics come from a new watch page',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=old',
        videoDetails: { title: 'Old Video', remainingTime: 45, lengthSeconds: 120 },
        isRemainingTimeStale: false,
        pageRuntimeReady: false,
      }),
    });

    globalThis.chrome.tabs.get = (_tabId, callback) => {
      callback({
        id: 1,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=new',
        active: false,
        hidden: false,
      });
    };

    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      callback({
        title: 'New Video',
        url: 'https://www.youtube.com/watch?v=new',
        pageMediaReady: true,
        lengthSeconds: 400,
        currentTime: 10,
        playbackRate: 1,
        paused: false,
        isLive: false,
      });
    };

    await refreshTabPlaybackMetrics(1);

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
    assert.equal(record.videoDetails.title, 'New Video');
    assert.equal(record.videoDetails.lengthSeconds, 400);
    assert.equal(record.videoDetails.remainingTime, 390);
    assert.equal(record.isRemainingTimeStale, false);
  },
);

test(
  'refreshTabPlaybackMetrics ignores async metric payloads that no longer match the tracked URL',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=old',
        pageRuntimeReady: false,
        pageMediaReady: false,
        videoDetails: null,
      }),
    });

    let getCallCount = 0;
    globalThis.chrome.tabs.get = (_tabId, callback) => {
      getCallCount += 1;
      setTimeout(() => {
        callback({
          id: 1,
          windowId: 1,
          url:
            getCallCount === 1
              ? 'https://www.youtube.com/watch?v=old'
              : 'https://www.youtube.com/watch?v=new',
          active: false,
          hidden: false,
        });
      }, 0);
    };

    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      setTimeout(() => {
        callback({
          title: 'Old Video',
          url: 'https://www.youtube.com/watch?v=old',
          pageMediaReady: true,
          lengthSeconds: 120,
          currentTime: 20,
          playbackRate: 1,
          paused: false,
          isLive: false,
        });
      }, 0);
    };

    const refreshPromise = refreshTabPlaybackMetrics(1);

    setTrackedTabRecord(1, createTabRecordFixture(1, {
      url: 'https://www.youtube.com/watch?v=new',
      pageRuntimeReady: false,
      pageMediaReady: false,
      videoDetails: null,
      isRemainingTimeStale: true,
    }));

    await refreshPromise;

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
    assert.equal(record.videoDetails, null);
    assert.equal(record.pageRuntimeReady, false);
    assert.equal(record.pageMediaReady, false);
    assert.equal(record.isRemainingTimeStale, true);
  },
);

test(
  'refreshTabPlaybackMetrics keeps remaining time stale until the current page reports media ready',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=new',
        pageRuntimeReady: true,
        pageMediaReady: false,
        videoDetails: { title: 'New Video', remainingTime: null, lengthSeconds: null },
        isRemainingTimeStale: true,
      }),
    });

    globalThis.chrome.tabs.get = (_tabId, callback) => {
      callback({
        id: 1,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=new',
        active: false,
        hidden: false,
      });
    };

    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      callback({
        title: 'New Video',
        url: 'https://www.youtube.com/watch?v=new',
        pageMediaReady: false,
        lengthSeconds: 400,
        currentTime: 10,
        playbackRate: 1,
        paused: false,
        isLive: false,
      });
    };

    await refreshTabPlaybackMetrics(1);

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.pageRuntimeReady, true);
    assert.equal(record.pageMediaReady, false);
    assert.equal(typeof record.mediaWaitStartedAt, 'number');
    assert.equal(record.videoDetails.lengthSeconds, 400);
    assert.equal(record.videoDetails.remainingTime, 400);
    assert.equal(record.isRemainingTimeStale, true);
  },
);

test(
  'refreshTabPlaybackMetrics self-resolves when playback metrics expose a ready video',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=archive',
        pageRuntimeReady: true,
        pageMediaReady: false,
        videoDetails: { title: 'Archived Stream', remainingTime: null, lengthSeconds: null },
        isRemainingTimeStale: true,
      }),
    });

    stubChromeTabMetrics({ url: 'https://www.youtube.com/watch?v=archive' });

    await refreshTabPlaybackMetrics(1);

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.pageRuntimeReady, true);
    assert.equal(record.pageMediaReady, true);
    assert.equal(record.mediaWaitStartedAt, null);
    assert.equal(record.videoDetails.lengthSeconds, 6211);
    assert.equal(record.videoDetails.remainingTime, 6211);
    assert.equal(record.isRemainingTimeStale, false);
  },
);

test(
  'refreshTabPlaybackMetrics ignores stale zero recorded length for archived streams',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=archive',
        pageRuntimeReady: true,
        pageMediaReady: false,
        videoDetails: { title: 'Archived Stream', remainingTime: null, lengthSeconds: 0 },
        isRemainingTimeStale: true,
      }),
    });

    stubChromeTabMetrics({ url: 'https://www.youtube.com/watch?v=archive' });

    await refreshTabPlaybackMetrics(1);

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.pageRuntimeReady, true);
    assert.equal(record.pageMediaReady, true);
    assert.equal(record.videoDetails.lengthSeconds, 6211);
    assert.equal(record.videoDetails.remainingTime, 6211);
    assert.equal(record.isRemainingTimeStale, false);
  },
);

test(
  'refreshTabPlaybackMetrics ignores zero playback duration when no valid length exists',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=archive',
        pageRuntimeReady: true,
        pageMediaReady: false,
        videoDetails: { title: 'Archived Stream', remainingTime: null, lengthSeconds: 0 },
        isRemainingTimeStale: true,
      }),
    });

    stubChromeTabMetrics({
      url: 'https://www.youtube.com/watch?v=archive',
      metrics: { duration: 0, currentTime: 0 },
    });

    await refreshTabPlaybackMetrics(1);

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.pageRuntimeReady, true);
    assert.equal(record.pageMediaReady, false);
    assert.equal(record.videoDetails.lengthSeconds, null);
    assert.equal(record.videoDetails.remainingTime, null);
    assert.equal(record.isRemainingTimeStale, true);
  },
);

test(
  'refreshTabPlaybackMetrics does not treat missing current time as playback evidence',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=archive',
        pageRuntimeReady: true,
        pageMediaReady: false,
        videoDetails: { title: 'Archived Stream', remainingTime: null, lengthSeconds: null },
        isRemainingTimeStale: true,
      }),
    });

    stubChromeTabMetrics({
      url: 'https://www.youtube.com/watch?v=archive',
      metrics: { duration: 6211, currentTime: null },
    });

    await refreshTabPlaybackMetrics(1);

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.pageRuntimeReady, true);
    assert.equal(record.pageMediaReady, false);
    assert.equal(record.videoDetails.lengthSeconds, 6211);
    assert.equal(record.videoDetails.remainingTime, 6211);
    assert.equal(record.isRemainingTimeStale, true);
  },
);

test(
  'refreshTabPlaybackMetrics keeps remaining time stale when page metadata and video duration disagree',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=previous',
        pageRuntimeReady: true,
        pageMediaReady: true,
        videoDetails: {
          title: 'OpenAI vs. Anthropic\'s Direct Faceoff + Future of Agents - With Aaron Levie',
          remainingTime: 3364,
          lengthSeconds: 3364,
        },
        isRemainingTimeStale: false,
      }),
    });

    globalThis.chrome.tabs.get = (_tabId, callback) => {
      callback({
        id: 1,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=previous',
        active: false,
        hidden: false,
      });
    };

    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      callback({
        title: 'OpenAI vs. Anthropic\'s Direct Faceoff + Future of Agents - With Aaron Levie',
        url: 'https://www.youtube.com/watch?v=previous',
        pageMediaReady: true,
        lengthSeconds: null,
        duration: 72,
        currentTime: 72,
        playbackRate: 1,
        paused: false,
        isLive: false,
      });
    };

    await refreshTabPlaybackMetrics(1);

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.pageRuntimeReady, true);
    assert.equal(record.pageMediaReady, false);
    assert.equal(typeof record.mediaWaitStartedAt, 'number');
    assert.equal(record.videoDetails.lengthSeconds, 3364);
    assert.equal(record.videoDetails.remainingTime, 3364);
    assert.equal(record.isRemainingTimeStale, true);
  },
);

test(
  'refreshTabPlaybackMetricsBatch recomputes and broadcasts once for multiple updates',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1),
      2: createTabRecordFixture(2),
      3: createTabRecordFixture(3),
    });

    globalThis.chrome.tabs.get = (tabId, callback) => {
      callback({
        id: tabId,
        windowId: 1,
        url: `https://www.youtube.com/watch?v=${tabId}`,
        active: false,
        hidden: false,
      });
    };
    globalThis.chrome.tabs.sendMessage = (tabId, _payload, callback) => {
      callback({
        title: `Video ${tabId}`,
        url: `https://www.youtube.com/watch?v=${tabId}`,
        pageMediaReady: true,
        lengthSeconds: 120,
        currentTime: tabId * 10,
        playbackRate: 1,
        paused: false,
        isLive: false,
      });
    };

    let broadcastCount = 0;
    globalThis.chrome.runtime.sendMessage = (_message, callback) => {
      broadcastCount += 1;
      callback?.();
    };

    const changed = await refreshTabPlaybackMetricsBatch([1, 2, 3], { concurrency: 2 });

    assert.equal(changed, true);
    assert.equal(broadcastCount, 1);
    assert.equal(trackedWindowState.tabRecordsById[1].videoDetails.remainingTime, 110);
    assert.equal(trackedWindowState.tabRecordsById[2].videoDetails.remainingTime, 100);
    assert.equal(trackedWindowState.tabRecordsById[3].videoDetails.remainingTime, 90);
  },
);
