import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSortState,
  getTabRecordsById,
  getTrackedWindowId,
} from '../../background/windows/tracked-window-store.js';
import {
  handlePlaybackMetricsReady,
  handleContentScriptReady,
  handlePageVideoDetails,
} from '../../background/messaging/page-events.js';
import { collectPlaybackMetrics } from '../../background/playback/collect.js';
import {
  ensureChromeApi,
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedTabRecords,
  setTrackedSortState,
} from '../helpers/background-test-helpers.js';

ensureChromeApi();

test('handlePageVideoDetails does not create records for non-watch YouTube pages', async () => {
  resetTrackedWindowState(1);

  await handlePageVideoDetails(
    {
      details: {
        url: 'https://www.youtube.com/',
        title: 'YouTube Home',
      },
    },
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/',
      },
    },
  );

  assert.equal(getTabRecordsById()[7], undefined);
  assert.deepEqual(getSortState().trackedTabOrder, []);
  assert.deepEqual(getSortState().targetVideoTabOrder, []);
});

test('handlePageVideoDetails does not claim a window for non-watch YouTube pages', async () => {
  resetTrackedWindowState();

  await handlePageVideoDetails(
    {
      details: {
        url: 'https://www.youtube.com/',
        title: 'YouTube Home',
      },
    },
    {
      tab: {
        id: 7,
        windowId: 99,
        url: 'https://www.youtube.com/',
      },
    },
  );

  assert.equal(getTrackedWindowId(), null);
  assert.equal(getTabRecordsById()[7], undefined);
});

test('handlePageVideoDetails removes tracked rows when tab leaves watch/shorts', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      videoDetails: { title: 'Video 7', remainingSeconds: 25, lengthSeconds: 100 },
      remainingSecondsStale: false,
    }),
  });
  setTrackedSortState({ trackedTabOrder: [7] });
  setTrackedSortState({ targetVideoTabOrder: [7] });

  await handlePageVideoDetails(
    {
      details: {
        url: 'https://www.youtube.com/results?search_query=music',
        title: 'Search results',
      },
    },
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/results?search_query=music',
      },
    },
  );

  assert.equal(getTabRecordsById()[7], undefined);
  assert.deepEqual(getSortState().trackedTabOrder, []);
  assert.deepEqual(getSortState().targetVideoTabOrder, []);
});

test('handleContentScriptReady removes tracked rows when a SPA tab leaves watch/shorts', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      videoDetails: { title: 'Video 7', remainingSeconds: 25, lengthSeconds: 100 },
      remainingSecondsStale: false,
    }),
  });
  setTrackedSortState({ trackedTabOrder: [7] });
  setTrackedSortState({ targetVideoTabOrder: [7] });

  await handleContentScriptReady(
    {},
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/results?search_query=music',
      },
    },
  );

  assert.equal(getTabRecordsById()[7], undefined);
  assert.deepEqual(getSortState().trackedTabOrder, []);
  assert.deepEqual(getSortState().targetVideoTabOrder, []);
});

test('handleContentScriptReady marks the runtime ready without collecting metrics', async () => {
  resetTrackedWindowState(1);
  globalThis.chrome.tabs = {
    get() {
      throw new Error('tabs.get should not be called on content script ready');
    },
    sendMessage() {
      throw new Error('tabs.sendMessage should not be called on content script ready');
    },
  };

  await handleContentScriptReady(
    {},
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=new',
      },
    },
  );

  const record = getTabRecordsById()[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
  assert.deepEqual(getSortState().trackedTabOrder, [7]);
  assert.deepEqual(getSortState().targetVideoTabOrder, [7]);
  assert.equal(record.contentScriptReady, true);
  assert.equal(record.playbackMetricsReady, false);
  assert.equal(record.remainingSecondsStale, true);
});

test('handleContentScriptReady clears stale sort data on watch-to-watch SPA navigation', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      url: 'https://www.youtube.com/watch?v=old',
      contentScriptReady: true,
      playbackMetricsReady: true,
      videoDetails: { title: 'Old Video', remainingSeconds: 25, lengthSeconds: 100 },
      remainingSecondsStale: false,
    }),
  });
  setTrackedSortState({ trackedTabOrder: [7] });
  setTrackedSortState({ targetVideoTabOrder: [7] });

  await handleContentScriptReady(
    {},
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=new',
        index: 0,
        pinned: false,
        active: false,
        hidden: false,
      },
    },
  );

  const record = getTabRecordsById()[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
  assert.equal(record.contentScriptReady, true);
  assert.equal(record.playbackMetricsReady, false);
  assert.equal(record.videoDetails, null);
  assert.equal(record.isLive, false);
  assert.equal(record.remainingSecondsStale, true);
  assert.deepEqual(getSortState().targetVideoTabOrder, [7]);
  assert.equal(getSortState().isYouTubeLayoutOrganised, false);
});

test('handlePlaybackMetricsReady removes tracked rows when a stale event arrives off watch/shorts', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      videoDetails: { title: 'Video 7', remainingSeconds: 25, lengthSeconds: 100 },
      remainingSecondsStale: false,
    }),
  });
  setTrackedSortState({ trackedTabOrder: [7] });
  setTrackedSortState({ targetVideoTabOrder: [7] });
  globalThis.chrome.tabs = {
    get() {
      throw new Error('tabs.get should not be called for stale non-watch media-ready events');
    },
    sendMessage() {
      throw new Error('tabs.sendMessage should not be called for stale non-watch media-ready events');
    },
  };

  await handlePlaybackMetricsReady(
    {},
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/results?search_query=music',
      },
    },
  );

  assert.equal(getTabRecordsById()[7], undefined);
  assert.deepEqual(getSortState().trackedTabOrder, []);
  assert.deepEqual(getSortState().targetVideoTabOrder, []);
});

test('handlePageVideoDetails resets carried remaining time on watch-to-watch SPA navigation', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      url: 'https://www.youtube.com/watch?v=old',
      contentScriptReady: true,
      videoDetails: { title: 'Old Video', remainingSeconds: 25, lengthSeconds: 100 },
      remainingSecondsStale: false,
    }),
  });

  await handlePageVideoDetails(
    {
      details: {
        url: 'https://www.youtube.com/watch?v=new',
        title: 'New Video',
        lengthSeconds: 400,
        isLive: false,
      },
    },
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=new',
      },
    },
  );

  const record = getTabRecordsById()[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
  assert.equal(record.contentScriptReady, false);
  assert.equal(record.videoDetails.title, 'New Video');
  assert.equal(record.videoDetails.lengthSeconds, 400);
  assert.equal(record.videoDetails.remainingSeconds, 400);
  assert.equal(record.remainingSecondsStale, true);
});

test('handlePageVideoDetails preserves ready state when the title changes for the same watch URL', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      url: 'https://www.youtube.com/watch?v=new',
      playbackMetricsReady: true,
      videoDetails: { title: 'Old Video', remainingSeconds: 3365, lengthSeconds: 3365 },
      remainingSecondsStale: false,
    }),
  });

  await handlePageVideoDetails(
    {
      details: {
        url: 'https://www.youtube.com/watch?v=new',
        title: 'Cyberpunk 2077 - PS5 Pro Update Trailer',
        lengthSeconds: 3365,
        isLive: false,
      },
    },
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=new',
      },
    },
  );

  const record = getTabRecordsById()[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
  assert.equal(record.playbackMetricsReady, true);
  assert.equal(record.videoDetails.title, 'Cyberpunk 2077 - PS5 Pro Update Trailer');
  assert.equal(record.videoDetails.lengthSeconds, 3365);
  assert.equal(record.videoDetails.remainingSeconds, 3365);
  assert.equal(record.remainingSecondsStale, false);
});

test('handlePageVideoDetails preserves ready state when only watch URL parameters change', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      url: 'https://www.youtube.com/watch?v=new',
      playbackMetricsReady: true,
      videoDetails: { title: 'Video', remainingSeconds: 120, lengthSeconds: 300 },
      remainingSecondsStale: false,
    }),
  });

  await handlePageVideoDetails(
    {
      details: {
        url: 'https://www.youtube.com/watch?v=new&list=abc123&index=10',
        title: 'Video',
        lengthSeconds: 300,
        isLive: false,
      },
    },
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=new&list=abc123&index=10',
      },
    },
  );

  const record = getTabRecordsById()[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new&list=abc123&index=10');
  assert.equal(record.playbackMetricsReady, true);
  assert.equal(record.videoDetails.remainingSeconds, 120);
  assert.equal(record.remainingSecondsStale, false);
});

test('handlePageVideoDetails invalidates playback state when a live stream ends', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      url: 'https://www.youtube.com/watch?v=live',
      playbackMetricsReady: true,
      isLive: true,
      videoDetails: { title: 'Live stream', remainingSeconds: null, lengthSeconds: null },
      remainingSecondsStale: false,
    }),
  });

  await handlePageVideoDetails(
    {
      details: {
        url: 'https://www.youtube.com/watch?v=live',
        title: 'Ended stream',
        isLive: false,
      },
    },
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=live',
      },
    },
  );

  const record = getTabRecordsById()[7];
  assert.equal(record.isLive, false);
  assert.equal(record.playbackMetricsReady, false);
  assert.equal(record.videoDetails.remainingSeconds, null);
  assert.equal(record.remainingSecondsStale, true);
  assert.equal(typeof record.metricsWaitStartedAt, 'number');
});

test(
  'same-video parameter navigation keeps ready remaining time through runtime refresh',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    setTrackedTabRecords({
      7: createTabRecordFixture(7, {
        url: 'https://www.youtube.com/watch?v=new',
        contentScriptReady: true,
        playbackMetricsReady: true,
        videoDetails: { title: 'Video', remainingSeconds: 120, lengthSeconds: 300 },
        remainingSecondsStale: false,
      }),
    });

    const sender = {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=new&list=abc123&index=10',
        index: 0,
        pinned: false,
        active: false,
        hidden: false,
      },
    };

    await handleContentScriptReady({}, sender);
    await handlePageVideoDetails(
      {
        details: {
          url: sender.tab.url,
          title: 'Video',
          lengthSeconds: 300,
          isLive: false,
        },
      },
      sender,
    );

    globalThis.chrome.tabs.get = async () => ({
        id: 7,
        windowId: 1,
        url: sender.tab.url,
        active: false,
        hidden: false,
      });
    globalThis.chrome.tabs.sendMessage = async () => ({
        title: 'Video',
        url: sender.tab.url,
        playbackMetricsReady: false,
        metadataDurationSeconds: 300,
        mediaDurationSeconds: 300,
        positionSeconds: 180,
        playbackRate: 1,
        isLive: false,
      });

    await collectPlaybackMetrics(7);

    const record = getTabRecordsById()[7];
    assert.equal(record.url, sender.tab.url);
    assert.equal(record.playbackMetricsReady, true);
    assert.equal(record.videoDetails.remainingSeconds, 120);
    assert.equal(record.remainingSecondsStale, false);
  },
);
