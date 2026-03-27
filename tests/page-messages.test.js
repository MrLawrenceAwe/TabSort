import assert from 'node:assert/strict';
import test from 'node:test';

import { backgroundStore } from '../background/store.js';
import { handlePageVideoDetailsMessage } from '../background/messages.js';
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
