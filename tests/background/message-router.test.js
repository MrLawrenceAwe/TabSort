import assert from 'node:assert/strict';
import test from 'node:test';

import { trackedWindowSnapshot } from '../../background/window-store.js';
import {
  handleVideoElementReady,
  handleContentScriptReady,
  handlePageVideoDetails,
} from '../../background/page-message-handlers.js';
import { refreshPlaybackState } from '../../background/refresh-playback-state.js';
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

  assert.equal(trackedWindowSnapshot.tabRecordsById[7], undefined);
  assert.deepEqual(trackedWindowSnapshot.trackedTabIdsInWindowOrder, []);
  assert.deepEqual(trackedWindowSnapshot.targetVideoTabOrder, []);
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

  assert.equal(trackedWindowSnapshot.windowId, null);
  assert.equal(trackedWindowSnapshot.tabRecordsById[7], undefined);
});

test('handlePageVideoDetails removes tracked rows when tab leaves watch/shorts', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      videoDetails: { title: 'Video 7', remainingTime: 25, lengthSeconds: 100 },
      remainingTimeStale: false,
    }),
  });
  setTrackedSortState({ trackedTabIdsInWindowOrder: [7] });
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

  assert.equal(trackedWindowSnapshot.tabRecordsById[7], undefined);
  assert.deepEqual(trackedWindowSnapshot.trackedTabIdsInWindowOrder, []);
  assert.deepEqual(trackedWindowSnapshot.targetVideoTabOrder, []);
});

test('handleContentScriptReady removes tracked rows when a SPA tab leaves watch/shorts', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      videoDetails: { title: 'Video 7', remainingTime: 25, lengthSeconds: 100 },
      remainingTimeStale: false,
    }),
  });
  setTrackedSortState({ trackedTabIdsInWindowOrder: [7] });
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

  assert.equal(trackedWindowSnapshot.tabRecordsById[7], undefined);
  assert.deepEqual(trackedWindowSnapshot.trackedTabIdsInWindowOrder, []);
  assert.deepEqual(trackedWindowSnapshot.targetVideoTabOrder, []);
});

test('handleContentScriptReady marks the runtime ready without collecting metrics', async () => {
  resetTrackedWindowState(1);
  globalThis.chrome.tabs = {
    get() {
      throw new Error('tabs.get should not be called on contentScriptReported');
    },
    sendMessage() {
      throw new Error('tabs.sendMessage should not be called on contentScriptReported');
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

  const record = trackedWindowSnapshot.tabRecordsById[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
  assert.deepEqual(trackedWindowSnapshot.trackedTabIdsInWindowOrder, [7]);
  assert.deepEqual(trackedWindowSnapshot.targetVideoTabOrder, [7]);
  assert.equal(record.contentScriptReported, true);
  assert.equal(record.mediaElementObserved, false);
  assert.equal(record.remainingTimeStale, true);
});

test('handleContentScriptReady clears stale sort data on watch-to-watch SPA navigation', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      url: 'https://www.youtube.com/watch?v=old',
      contentScriptReported: true,
      mediaElementObserved: true,
      videoDetails: { title: 'Old Video', remainingTime: 25, lengthSeconds: 100 },
      remainingTimeStale: false,
    }),
  });
  setTrackedSortState({ trackedTabIdsInWindowOrder: [7] });
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

  const record = trackedWindowSnapshot.tabRecordsById[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
  assert.equal(record.contentScriptReported, true);
  assert.equal(record.mediaElementObserved, false);
  assert.equal(record.videoDetails, null);
  assert.equal(record.isLiveNow, false);
  assert.equal(record.remainingTimeStale, true);
  assert.deepEqual(trackedWindowSnapshot.targetVideoTabOrder, [7]);
  assert.equal(trackedWindowSnapshot.eligibleVideosAlreadySorted, false);
});

test('handleVideoElementReady removes tracked rows when a stale event arrives off watch/shorts', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      videoDetails: { title: 'Video 7', remainingTime: 25, lengthSeconds: 100 },
      remainingTimeStale: false,
    }),
  });
  setTrackedSortState({ trackedTabIdsInWindowOrder: [7] });
  setTrackedSortState({ targetVideoTabOrder: [7] });
  globalThis.chrome.tabs = {
    get() {
      throw new Error('tabs.get should not be called for stale non-watch media-ready events');
    },
    sendMessage() {
      throw new Error('tabs.sendMessage should not be called for stale non-watch media-ready events');
    },
  };

  await handleVideoElementReady(
    {},
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/results?search_query=music',
      },
    },
  );

  assert.equal(trackedWindowSnapshot.tabRecordsById[7], undefined);
  assert.deepEqual(trackedWindowSnapshot.trackedTabIdsInWindowOrder, []);
  assert.deepEqual(trackedWindowSnapshot.targetVideoTabOrder, []);
});

test('handlePageVideoDetails resets carried remaining time on watch-to-watch SPA navigation', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      url: 'https://www.youtube.com/watch?v=old',
      contentScriptReported: true,
      videoDetails: { title: 'Old Video', remainingTime: 25, lengthSeconds: 100 },
      remainingTimeStale: false,
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

  const record = trackedWindowSnapshot.tabRecordsById[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
  assert.equal(record.contentScriptReported, false);
  assert.equal(record.videoDetails.title, 'New Video');
  assert.equal(record.videoDetails.lengthSeconds, 400);
  assert.equal(record.videoDetails.remainingTime, 400);
  assert.equal(record.remainingTimeStale, true);
});

test('handlePageVideoDetails preserves ready state when the title changes for the same watch URL', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      url: 'https://www.youtube.com/watch?v=new',
      mediaElementObserved: true,
      videoDetails: { title: 'Old Video', remainingTime: 3365, lengthSeconds: 3365 },
      remainingTimeStale: false,
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

  const record = trackedWindowSnapshot.tabRecordsById[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
  assert.equal(record.mediaElementObserved, true);
  assert.equal(record.videoDetails.title, 'Cyberpunk 2077 - PS5 Pro Update Trailer');
  assert.equal(record.videoDetails.lengthSeconds, 3365);
  assert.equal(record.videoDetails.remainingTime, 3365);
  assert.equal(record.remainingTimeStale, false);
});

test('handlePageVideoDetails preserves ready state when only watch URL parameters change', async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    7: createTabRecordFixture(7, {
      url: 'https://www.youtube.com/watch?v=new',
      mediaElementObserved: true,
      videoDetails: { title: 'Video', remainingTime: 120, lengthSeconds: 300 },
      remainingTimeStale: false,
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

  const record = trackedWindowSnapshot.tabRecordsById[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new&list=abc123&index=10');
  assert.equal(record.mediaElementObserved, true);
  assert.equal(record.videoDetails.remainingTime, 120);
  assert.equal(record.remainingTimeStale, false);
});

test(
  'same-video parameter navigation keeps ready remaining time through runtime refresh',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    setTrackedTabRecords({
      7: createTabRecordFixture(7, {
        url: 'https://www.youtube.com/watch?v=new',
        contentScriptReported: true,
        mediaElementObserved: true,
        videoDetails: { title: 'Video', remainingTime: 120, lengthSeconds: 300 },
        remainingTimeStale: false,
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

    globalThis.chrome.tabs.get = (_tabId, callback) => {
      callback({
        id: 7,
        windowId: 1,
        url: sender.tab.url,
        active: false,
        hidden: false,
      });
    };
    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      callback({
        title: 'Video',
        url: sender.tab.url,
        mediaElementObserved: false,
        lengthSeconds: 300,
        duration: 300,
        currentTime: 180,
        playbackRate: 1,
        isLive: false,
      });
    };

    await refreshPlaybackState(7);

    const record = trackedWindowSnapshot.tabRecordsById[7];
    assert.equal(record.url, sender.tab.url);
    assert.equal(record.mediaElementObserved, true);
    assert.equal(record.videoDetails.remainingTime, 120);
    assert.equal(record.remainingTimeStale, false);
  },
);
