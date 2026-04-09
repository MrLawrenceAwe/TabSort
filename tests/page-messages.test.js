import assert from 'node:assert/strict';
import test from 'node:test';

import { backgroundStore } from '../background/store.js';
import {
  handlePageRuntimeReadyMessage,
  handlePageVideoDetailsMessage,
} from '../background/messages.js';
import {
  ensureChromeApi,
  makeTrackedTabRecord,
  resetBackgroundStore,
} from './helpers/background-test-helpers.js';

ensureChromeApi();

test('handlePageVideoDetailsMessage does not create records for non-watch YouTube pages', async () => {
  resetBackgroundStore(1);

  await handlePageVideoDetailsMessage(
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

  assert.equal(backgroundStore.trackedTabsById[7], undefined);
  assert.deepEqual(backgroundStore.visibleOrder, []);
  assert.deepEqual(backgroundStore.targetOrder, []);
});

test('handlePageVideoDetailsMessage removes tracked rows when tab leaves watch/shorts', async () => {
  resetBackgroundStore(1);
  backgroundStore.trackedTabsById = {
    7: makeTrackedTabRecord(7, {
      videoDetails: { title: 'Video 7', remainingTime: 25, lengthSeconds: 100 },
      isRemainingTimeStale: false,
    }),
  };
  backgroundStore.visibleOrder = [7];
  backgroundStore.targetOrder = [7];

  await handlePageVideoDetailsMessage(
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

  assert.equal(backgroundStore.trackedTabsById[7], undefined);
  assert.deepEqual(backgroundStore.visibleOrder, []);
  assert.deepEqual(backgroundStore.targetOrder, []);
});

test('handlePageRuntimeReadyMessage removes tracked rows when a SPA tab leaves watch/shorts', async () => {
  resetBackgroundStore(1);
  backgroundStore.trackedTabsById = {
    7: makeTrackedTabRecord(7, {
      videoDetails: { title: 'Video 7', remainingTime: 25, lengthSeconds: 100 },
      isRemainingTimeStale: false,
    }),
  };
  backgroundStore.visibleOrder = [7];
  backgroundStore.targetOrder = [7];

  await handlePageRuntimeReadyMessage(
    {},
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/results?search_query=music',
      },
    },
  );

  assert.equal(backgroundStore.trackedTabsById[7], undefined);
  assert.deepEqual(backgroundStore.visibleOrder, []);
  assert.deepEqual(backgroundStore.targetOrder, []);
});

test('handlePageRuntimeReadyMessage marks the runtime ready without collecting metrics', async () => {
  resetBackgroundStore(1);
  globalThis.chrome.tabs = {
    get() {
      throw new Error('tabs.get should not be called on pageRuntimeReady');
    },
    sendMessage() {
      throw new Error('tabs.sendMessage should not be called on pageRuntimeReady');
    },
  };

  await handlePageRuntimeReadyMessage(
    {},
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=new',
      },
    },
  );

  const record = backgroundStore.trackedTabsById[7];
  assert.equal(record.url, null);
  assert.equal(record.pageRuntimeReady, true);
  assert.equal(record.pageMediaReady, false);
  assert.equal(record.isRemainingTimeStale, true);
});

test('handlePageVideoDetailsMessage resets carried remaining time on watch-to-watch SPA navigation', async () => {
  resetBackgroundStore(1);
  backgroundStore.trackedTabsById = {
    7: makeTrackedTabRecord(7, {
      url: 'https://www.youtube.com/watch?v=old',
      videoDetails: { title: 'Old Video', remainingTime: 25, lengthSeconds: 100 },
      isRemainingTimeStale: false,
    }),
  };

  await handlePageVideoDetailsMessage(
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

  const record = backgroundStore.trackedTabsById[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
  assert.equal(record.videoDetails.title, 'New Video');
  assert.equal(record.videoDetails.lengthSeconds, 400);
  assert.equal(record.videoDetails.remainingTime, 400);
  assert.equal(record.isRemainingTimeStale, true);
});

test('handlePageVideoDetailsMessage resets carried remaining time when the title changes for the same watch URL', async () => {
  resetBackgroundStore(1);
  backgroundStore.trackedTabsById = {
    7: makeTrackedTabRecord(7, {
      url: 'https://www.youtube.com/watch?v=new',
      pageMediaReady: true,
      videoDetails: { title: 'Old Video', remainingTime: 3365, lengthSeconds: 3365 },
      isRemainingTimeStale: false,
    }),
  };

  await handlePageVideoDetailsMessage(
    {
      details: {
        url: 'https://www.youtube.com/watch?v=new',
        title: 'Cyberpunk 2077 - PS5 Pro Update Trailer',
        lengthSeconds: 72,
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

  const record = backgroundStore.trackedTabsById[7];
  assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
  assert.equal(record.pageMediaReady, false);
  assert.equal(record.videoDetails.title, 'Cyberpunk 2077 - PS5 Pro Update Trailer');
  assert.equal(record.videoDetails.lengthSeconds, 72);
  assert.equal(record.videoDetails.remainingTime, 72);
  assert.equal(record.isRemainingTimeStale, true);
});
