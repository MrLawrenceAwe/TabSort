import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMutableTabRecord,
  getTabRecordsById,
} from '../../background/windows/store.js';
import {
  collectPlaybackMetrics,
  collectPlaybackMetricsBatch,
} from '../../background/playback/collect.js';
import {
  ensureChromeApi,
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedTabRecords,
  setTrackedTabRecord,
  createPlaybackMetricsFixture,
  stubChromeTabGetSequence,
  stubChromeTabMetricPayload,
  stubChromeTabMetrics,
} from '../helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test(
  'collectPlaybackMetrics applies updates to the latest record object after async boundaries',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    const initialRecord = createTabRecordFixture(1, { contentScriptReady: false });
    setTrackedTabRecords({ 1: initialRecord });

    stubChromeTabGetSequence([{ tabId: 1 }], { async: true });
    stubChromeTabMetricPayload(createPlaybackMetricsFixture({ tabId: 1 }), { async: true });

    const collectPromise = collectPlaybackMetrics(1);

    const replacementRecord = createTabRecordFixture(1, { contentScriptReady: false });
    setTrackedTabRecords({ 1: replacementRecord });

    await collectPromise;

    assert.equal(getMutableTabRecord(1), replacementRecord);
    assert.equal(replacementRecord.contentScriptReady, true);
    assert.equal(replacementRecord.videoDetails.lengthSeconds, 120);
    assert.equal(replacementRecord.videoDetails.remainingSeconds, 100);
    assert.equal(replacementRecord.remainingSecondsStale, false);
  },
);

test(
  'collectPlaybackMetrics updates the stored URL when collected metrics come from a new watch page',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=old',
        videoDetails: { title: 'Old Video', remainingSeconds: 45, lengthSeconds: 120 },
        remainingSecondsStale: false,
        contentScriptReady: false,
      }),
    });

    stubChromeTabGetSequence([{ tabId: 1, url: 'https://www.youtube.com/watch?v=new' }]);
    stubChromeTabMetricPayload(
      createPlaybackMetricsFixture({
        title: 'New Video',
        url: 'https://www.youtube.com/watch?v=new',
        lengthSeconds: 400,
        currentTime: 10,
      }),
    );

    await collectPlaybackMetrics(1);

    const record = getTabRecordsById()[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
    assert.equal(record.videoDetails.title, 'New Video');
    assert.equal(record.videoDetails.lengthSeconds, 400);
    assert.equal(record.videoDetails.remainingSeconds, 390);
    assert.equal(record.remainingSecondsStale, false);
  },
);

test(
  'collectPlaybackMetrics ignores async metric payloads that no longer match the tracked URL',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=old',
        contentScriptReady: false,
        playbackMetricsReady: false,
        videoDetails: null,
      }),
    });

    stubChromeTabGetSequence([
      { tabId: 1, url: 'https://www.youtube.com/watch?v=old' },
      { tabId: 1, url: 'https://www.youtube.com/watch?v=new' },
    ], { async: true });
    stubChromeTabMetricPayload(
      createPlaybackMetricsFixture({
        title: 'Old Video',
        url: 'https://www.youtube.com/watch?v=old',
      }),
      { async: true },
    );

    const collectPromise = collectPlaybackMetrics(1);

    setTrackedTabRecord(1, createTabRecordFixture(1, {
      url: 'https://www.youtube.com/watch?v=new',
      contentScriptReady: false,
      playbackMetricsReady: false,
      videoDetails: null,
      remainingSecondsStale: true,
    }));

    await collectPromise;

    const record = getTabRecordsById()[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
    assert.equal(record.videoDetails, null);
    assert.equal(record.contentScriptReady, false);
    assert.equal(record.playbackMetricsReady, false);
    assert.equal(record.remainingSecondsStale, true);
  },
);

test(
  'collectPlaybackMetrics keeps remaining time stale until the current page reports media ready',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=new',
        contentScriptReady: true,
        playbackMetricsReady: false,
        videoDetails: { title: 'New Video', remainingSeconds: null, lengthSeconds: null },
        remainingSecondsStale: true,
      }),
    });

    stubChromeTabGetSequence([{ tabId: 1, url: 'https://www.youtube.com/watch?v=new' }]);
    stubChromeTabMetricPayload(
      createPlaybackMetricsFixture({
        title: 'New Video',
        url: 'https://www.youtube.com/watch?v=new',
        playbackMetricsReady: false,
        lengthSeconds: 400,
        currentTime: 10,
      }),
    );

    await collectPlaybackMetrics(1);

    const record = getTabRecordsById()[1];
    assert.equal(record.contentScriptReady, true);
    assert.equal(record.playbackMetricsReady, false);
    assert.equal(typeof record.metricsWaitStartedAt, 'number');
    assert.equal(record.videoDetails.lengthSeconds, 400);
    assert.equal(record.videoDetails.remainingSeconds, 400);
    assert.equal(record.remainingSecondsStale, true);
  },
);

test(
  'collectPlaybackMetrics self-resolves when playback metrics expose a ready video',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=archive',
        contentScriptReady: true,
        playbackMetricsReady: false,
        videoDetails: { title: 'Archived Stream', remainingSeconds: null, lengthSeconds: null },
        remainingSecondsStale: true,
      }),
    });

    stubChromeTabMetrics({ url: 'https://www.youtube.com/watch?v=archive' });

    await collectPlaybackMetrics(1);

    const record = getTabRecordsById()[1];
    assert.equal(record.contentScriptReady, true);
    assert.equal(record.playbackMetricsReady, true);
    assert.equal(record.metricsWaitStartedAt, null);
    assert.equal(record.videoDetails.lengthSeconds, 6211);
    assert.equal(record.videoDetails.remainingSeconds, 6211);
    assert.equal(record.remainingSecondsStale, false);
  },
);

test(
  'collectPlaybackMetrics ignores stale zero recorded length for archived streams',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=archive',
        contentScriptReady: true,
        playbackMetricsReady: false,
        videoDetails: { title: 'Archived Stream', remainingSeconds: null, lengthSeconds: 0 },
        remainingSecondsStale: true,
      }),
    });

    stubChromeTabMetrics({ url: 'https://www.youtube.com/watch?v=archive' });

    await collectPlaybackMetrics(1);

    const record = getTabRecordsById()[1];
    assert.equal(record.contentScriptReady, true);
    assert.equal(record.playbackMetricsReady, true);
    assert.equal(record.videoDetails.lengthSeconds, 6211);
    assert.equal(record.videoDetails.remainingSeconds, 6211);
    assert.equal(record.remainingSecondsStale, false);
  },
);

test(
  'collectPlaybackMetrics ignores zero playback duration when no valid length exists',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=archive',
        contentScriptReady: true,
        playbackMetricsReady: false,
        videoDetails: { title: 'Archived Stream', remainingSeconds: null, lengthSeconds: 0 },
        remainingSecondsStale: true,
      }),
    });

    stubChromeTabMetrics({
      url: 'https://www.youtube.com/watch?v=archive',
      metrics: { duration: 0, currentTime: 0 },
    });

    await collectPlaybackMetrics(1);

    const record = getTabRecordsById()[1];
    assert.equal(record.contentScriptReady, true);
    assert.equal(record.playbackMetricsReady, false);
    assert.equal(record.videoDetails.lengthSeconds, null);
    assert.equal(record.videoDetails.remainingSeconds, null);
    assert.equal(record.remainingSecondsStale, true);
  },
);

test(
  'collectPlaybackMetrics does not treat missing current time as playback evidence',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=archive',
        contentScriptReady: true,
        playbackMetricsReady: false,
        videoDetails: { title: 'Archived Stream', remainingSeconds: null, lengthSeconds: null },
        remainingSecondsStale: true,
      }),
    });

    stubChromeTabMetrics({
      url: 'https://www.youtube.com/watch?v=archive',
      metrics: { duration: 6211, currentTime: null },
    });

    await collectPlaybackMetrics(1);

    const record = getTabRecordsById()[1];
    assert.equal(record.contentScriptReady, true);
    assert.equal(record.playbackMetricsReady, false);
    assert.equal(record.videoDetails.lengthSeconds, 6211);
    assert.equal(record.videoDetails.remainingSeconds, 6211);
    assert.equal(record.remainingSecondsStale, true);
  },
);

test(
  'collectPlaybackMetrics keeps remaining time stale when page metadata and video duration disagree',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=previous',
        contentScriptReady: true,
        playbackMetricsReady: true,
        videoDetails: {
          title: 'OpenAI vs. Anthropic\'s Direct Faceoff + Future of Agents - With Aaron Levie',
          remainingSeconds: 3364,
          lengthSeconds: 3364,
        },
        remainingSecondsStale: false,
      }),
    });

    stubChromeTabGetSequence([{ tabId: 1, url: 'https://www.youtube.com/watch?v=previous' }]);
    stubChromeTabMetricPayload(
      createPlaybackMetricsFixture({
        title: 'OpenAI vs. Anthropic\'s Direct Faceoff + Future of Agents - With Aaron Levie',
        url: 'https://www.youtube.com/watch?v=previous',
        lengthSeconds: null,
        duration: 72,
        currentTime: 72,
      }),
    );

    await collectPlaybackMetrics(1);

    const record = getTabRecordsById()[1];
    assert.equal(record.contentScriptReady, true);
    assert.equal(record.playbackMetricsReady, false);
    assert.equal(typeof record.metricsWaitStartedAt, 'number');
    assert.equal(record.videoDetails.lengthSeconds, 3364);
    assert.equal(record.videoDetails.remainingSeconds, 3364);
    assert.equal(record.remainingSecondsStale, true);
  },
);

test(
  'collectPlaybackMetricsBatch recomputes and broadcasts once for multiple updates',
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
        playbackMetricsReady: true,
        lengthSeconds: 120,
        currentTime: tabId * 10,
        playbackRate: 1,
        isLive: false,
      });
    };

    let broadcastCount = 0;
    globalThis.chrome.runtime.sendMessage = (_message, callback) => {
      broadcastCount += 1;
      callback?.();
    };

    const changed = await collectPlaybackMetricsBatch([1, 2, 3], { concurrency: 2 });

    assert.equal(changed, true);
    assert.equal(broadcastCount, 1);
    assert.equal(getTabRecordsById()[1].videoDetails.remainingSeconds, 110);
    assert.equal(getTabRecordsById()[2].videoDetails.remainingSeconds, 100);
    assert.equal(getTabRecordsById()[3].videoDetails.remainingSeconds, 90);
  },
);

test(
  'collectPlaybackMetrics reinjects the bundled YouTube runtime when no receiver is available',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        contentScriptReady: false,
        playbackMetricsReady: false,
        videoDetails: null,
      }),
    });

    stubChromeTabGetSequence([
      { tabId: 1, url: 'https://www.youtube.com/watch?v=1' },
      { tabId: 1, url: 'https://www.youtube.com/watch?v=1' },
    ]);

    const injected = [];
    globalThis.chrome.scripting = {
      executeScript(options, callback) {
        injected.push(options);
        callback();
      },
    };

    let sendCount = 0;
    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      sendCount += 1;
      if (sendCount === 1) {
        globalThis.chrome.runtime.lastError = new Error(
          'Could not establish connection. Receiving end does not exist.',
        );
        callback();
        globalThis.chrome.runtime.lastError = null;
        return;
      }
      callback(createPlaybackMetricsFixture({ tabId: 1 }));
    };

    await collectPlaybackMetrics(1);

    const record = getTabRecordsById()[1];
    assert.equal(sendCount, 2);
    assert.deepEqual(injected, [
      {
        target: { tabId: 1 },
        files: ['dist/content-runtime.js'],
      },
    ]);
    assert.equal(record.videoDetails.remainingSeconds, 100);
    assert.equal(record.remainingSecondsStale, false);
  },
);

test(
  'collectPlaybackMetrics waits for the injected runtime before giving up on missing receivers',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        contentScriptReady: false,
        playbackMetricsReady: false,
        videoDetails: null,
      }),
    });

    stubChromeTabGetSequence([
      { tabId: 1, url: 'https://www.youtube.com/watch?v=1' },
      { tabId: 1, url: 'https://www.youtube.com/watch?v=1' },
    ]);

    globalThis.chrome.scripting = {
      executeScript(_options, callback) {
        callback();
      },
    };

    let sendCount = 0;
    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      sendCount += 1;
      if (sendCount < 3) {
        globalThis.chrome.runtime.lastError = new Error(
          'Could not establish connection. Receiving end does not exist.',
        );
        callback();
        globalThis.chrome.runtime.lastError = null;
        return;
      }
      callback(createPlaybackMetricsFixture({ tabId: 1 }));
    };

    await collectPlaybackMetrics(1);

    const record = getTabRecordsById()[1];
    assert.equal(sendCount, 3);
    assert.equal(record.videoDetails.remainingSeconds, 100);
    assert.equal(record.remainingSecondsStale, false);
  },
);
