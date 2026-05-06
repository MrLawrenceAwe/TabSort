import assert from 'node:assert/strict';
import test from 'node:test';

import { windowSessionState } from '../../background/window-session-state.js';
import {
  handlePageMediaReady,
  handlePageRuntimeReady,
  handlePageVideoDetails,
} from '../../background/page-message-handlers.js';
import {
  ensureChromeApi,
  createTabRecordFixture,
  resetTrackedWindowState,
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

  assert.equal(windowSessionState.tabRecordsById[7], undefined);
  assert.deepEqual(windowSessionState.visibleTabIds, []);
  assert.deepEqual(windowSessionState.targetSortableTabIds, []);
});

test('handlePageVideoDetails removes tracked rows when tab leaves watch/shorts', async () => {
  resetTrackedWindowState(1);
  windowSessionState.tabRecordsById = {
    7: createTabRecordFixture(7, {
      videoDetails: { title: 'Video 7', remainingTime: 25, lengthSeconds: 100 },
      isRemainingTimeStale: false,
    }),
  };
  windowSessionState.visibleTabIds = [7];
  windowSessionState.targetSortableTabIds = [7];

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

  assert.equal(windowSessionState.tabRecordsById[7], undefined);
  assert.deepEqual(windowSessionState.visibleTabIds, []);
  assert.deepEqual(windowSessionState.targetSortableTabIds, []);
});

test('handlePageRuntimeReady removes tracked rows when a SPA tab leaves watch/shorts', async () => {
  resetTrackedWindowState(1);
  windowSessionState.tabRecordsById = {
    7: createTabRecordFixture(7, {
      videoDetails: { title: 'Video 7', remainingTime: 25, lengthSeconds: 100 },
      isRemainingTimeStale: false,
    }),
  };
  windowSessionState.visibleTabIds = [7];
  windowSessionState.targetSortableTabIds = [7];

  await handlePageRuntimeReady(
    {},
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/results?search_query=music',
      },
    },
  );

  assert.equal(windowSessionState.tabRecordsById[7], undefined);
  assert.deepEqual(windowSessionState.visibleTabIds, []);
  assert.deepEqual(windowSessionState.targetSortableTabIds, []);
});

test('handlePageRuntimeReady marks the runtime ready without collecting metrics', async () => {
  resetTrackedWindowState(1);
  globalThis.chrome.tabs = {
    get() {
      throw new Error('tabs.get should not be called on pageRuntimeReady');
    },
    sendMessage() {
      throw new Error('tabs.sendMessage should not be called on pageRuntimeReady');
    },
  };

  await handlePageRuntimeReady(
    {},
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=new',
      },
    },
  );

  const record = windowSessionState.tabRecordsById[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
  assert.deepEqual(windowSessionState.visibleTabIds, [7]);
  assert.deepEqual(windowSessionState.targetSortableTabIds, [7]);
  assert.equal(record.pageRuntimeReady, true);
  assert.equal(record.pageMediaReady, false);
  assert.equal(record.isRemainingTimeStale, true);
});

test('handlePageMediaReady removes tracked rows when a stale event arrives off watch/shorts', async () => {
  resetTrackedWindowState(1);
  windowSessionState.tabRecordsById = {
    7: createTabRecordFixture(7, {
      videoDetails: { title: 'Video 7', remainingTime: 25, lengthSeconds: 100 },
      isRemainingTimeStale: false,
    }),
  };
  windowSessionState.visibleTabIds = [7];
  windowSessionState.targetSortableTabIds = [7];
  globalThis.chrome.tabs = {
    get() {
      throw new Error('tabs.get should not be called for stale non-watch media-ready events');
    },
    sendMessage() {
      throw new Error('tabs.sendMessage should not be called for stale non-watch media-ready events');
    },
  };

  await handlePageMediaReady(
    {},
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/results?search_query=music',
      },
    },
  );

  assert.equal(windowSessionState.tabRecordsById[7], undefined);
  assert.deepEqual(windowSessionState.visibleTabIds, []);
  assert.deepEqual(windowSessionState.targetSortableTabIds, []);
});

test('handlePageVideoDetails resets carried remaining time on watch-to-watch SPA navigation', async () => {
  resetTrackedWindowState(1);
  windowSessionState.tabRecordsById = {
    7: createTabRecordFixture(7, {
      url: 'https://www.youtube.com/watch?v=old',
      pageRuntimeReady: true,
      videoDetails: { title: 'Old Video', remainingTime: 25, lengthSeconds: 100 },
      isRemainingTimeStale: false,
    }),
  };

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

  const record = windowSessionState.tabRecordsById[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
  assert.equal(record.pageRuntimeReady, false);
  assert.equal(record.videoDetails.title, 'New Video');
  assert.equal(record.videoDetails.lengthSeconds, 400);
  assert.equal(record.videoDetails.remainingTime, 400);
  assert.equal(record.isRemainingTimeStale, true);
});

test('handlePageVideoDetails preserves ready state when the title changes for the same watch URL', async () => {
  resetTrackedWindowState(1);
  windowSessionState.tabRecordsById = {
    7: createTabRecordFixture(7, {
      url: 'https://www.youtube.com/watch?v=new',
      pageMediaReady: true,
      videoDetails: { title: 'Old Video', remainingTime: 3365, lengthSeconds: 3365 },
      isRemainingTimeStale: false,
    }),
  };

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

  const record = windowSessionState.tabRecordsById[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
  assert.equal(record.pageMediaReady, true);
  assert.equal(record.videoDetails.title, 'Cyberpunk 2077 - PS5 Pro Update Trailer');
  assert.equal(record.videoDetails.lengthSeconds, 3365);
  assert.equal(record.videoDetails.remainingTime, 3365);
  assert.equal(record.isRemainingTimeStale, false);
});

test('handlePageVideoDetails preserves ready state when only watch URL parameters change', async () => {
  resetTrackedWindowState(1);
  windowSessionState.tabRecordsById = {
    7: createTabRecordFixture(7, {
      url: 'https://www.youtube.com/watch?v=new',
      pageMediaReady: true,
      videoDetails: { title: 'Video', remainingTime: 120, lengthSeconds: 300 },
      isRemainingTimeStale: false,
    }),
  };

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

  const record = windowSessionState.tabRecordsById[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new&list=abc123&index=10');
  assert.equal(record.pageMediaReady, true);
  assert.equal(record.videoDetails.remainingTime, 120);
  assert.equal(record.isRemainingTimeStale, false);
});
