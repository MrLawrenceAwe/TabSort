import assert from 'node:assert/strict';
import test from 'node:test';

import { backgroundStore } from '../background/background-store.js';
import { handlePageVideoDetails } from '../background/handlers/content-script.js';
import {
  ensureChromeApi,
  makeTrackedTabRecord,
  resetBackgroundStore,
} from './helpers/background-test-helpers.js';

ensureChromeApi();

test('handlePageVideoDetails does not create records for non-watch YouTube pages', async () => {
  resetBackgroundStore(1);

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

  assert.equal(backgroundStore.trackedVideoTabsById[7], undefined);
  assert.deepEqual(backgroundStore.visibleTabOrderTabIds, []);
  assert.deepEqual(backgroundStore.targetSortOrderTabIds, []);
});

test('handlePageVideoDetails removes tracked rows when tab leaves watch/shorts', async () => {
  resetBackgroundStore(1);
  backgroundStore.trackedVideoTabsById = {
    7: makeTrackedTabRecord(7, {
      videoDetails: { title: 'Video 7', remainingTime: 25, lengthSeconds: 100 },
      isRemainingTimeStale: false,
    }),
  };
  backgroundStore.visibleTabOrderTabIds = [7];
  backgroundStore.targetSortOrderTabIds = [7];

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

  assert.equal(backgroundStore.trackedVideoTabsById[7], undefined);
  assert.deepEqual(backgroundStore.visibleTabOrderTabIds, []);
  assert.deepEqual(backgroundStore.targetSortOrderTabIds, []);
});
