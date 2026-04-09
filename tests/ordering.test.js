import assert from 'node:assert/strict';
import test from 'node:test';

import { backgroundStore } from '../background/store.js';
import { recomputeSortState } from '../background/sort-state.js';
import {
  ensureChromeApi,
  makeTrackedTabRecord,
  resetBackgroundStore,
} from './helpers/background-test-helpers.js';

ensureChromeApi();

test('orders known remaining-time tabs before unknown tabs', () => {
  resetBackgroundStore();
  backgroundStore.trackedTabsById = {
    1: makeTrackedTabRecord(1, { index: 0, videoDetails: { remainingTime: 50 }, isRemainingTimeStale: false }),
    2: makeTrackedTabRecord(2, { index: 1, videoDetails: { remainingTime: null }, isRemainingTimeStale: true }),
    3: makeTrackedTabRecord(3, { index: 2, videoDetails: { remainingTime: 10 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.deepEqual(backgroundStore.targetOrder, [3, 1, 2]);
  assert.deepEqual(backgroundStore.visibleOrder, [1, 2, 3]);
  assert.equal(backgroundStore.allSortableTabsSorted, false);
});

test('marks window as sorted only when all actionable tabs are known and ordered', () => {
  resetBackgroundStore();
  backgroundStore.trackedTabsById = {
    1: makeTrackedTabRecord(1, { index: 0, videoDetails: { remainingTime: 5 }, isRemainingTimeStale: false }),
    2: makeTrackedTabRecord(2, { index: 1, videoDetails: { remainingTime: 20 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.equal(backgroundStore.allSortableTabsSorted, true);
  assert.equal(backgroundStore.sortSummary.order.allRemainingTimesKnown, true);
  assert.equal(backgroundStore.sortSummary.order.allSorted, true);
  assert.equal(backgroundStore.sortSummary.readyTabs.outOfOrder, false);
});

test('derives sort summary metrics for non-contiguous and out-of-order ready subsets', () => {
  resetBackgroundStore();
  backgroundStore.trackedTabsById = {
    1: makeTrackedTabRecord(1, { index: 0, isRemainingTimeStale: true, isActiveTab: false, isHidden: true }),
    2: makeTrackedTabRecord(2, { index: 1, videoDetails: { remainingTime: 20 }, isRemainingTimeStale: false }),
    3: makeTrackedTabRecord(3, { index: 2, isRemainingTimeStale: true }),
    4: makeTrackedTabRecord(4, { index: 3, videoDetails: { remainingTime: 10 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.equal(backgroundStore.sortSummary.counts.ready, 2);
  assert.equal(backgroundStore.sortSummary.readyTabs.atFront, false);
  assert.equal(backgroundStore.sortSummary.readyTabs.contiguous, false);
  assert.equal(backgroundStore.sortSummary.readyTabs.outOfOrder, true);
  assert.equal(backgroundStore.sortSummary.backgroundTabs.haveStaleRemainingTime, true);
});

test('handles records without a finite index deterministically', () => {
  resetBackgroundStore();
  backgroundStore.trackedTabsById = {
    1: makeTrackedTabRecord(1, { index: 0, videoDetails: { remainingTime: 8 }, isRemainingTimeStale: false }),
    2: makeTrackedTabRecord(2, { index: undefined, videoDetails: { remainingTime: 4 }, isRemainingTimeStale: false }),
    3: makeTrackedTabRecord(3, { index: undefined, videoDetails: { remainingTime: 2 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.deepEqual(backgroundStore.visibleOrder, [1, 2, 3]);
  assert.deepEqual(backgroundStore.targetOrder, [3, 2, 1]);
});

test('live tabs do not block sorted readiness for VOD tabs with known remaining times', () => {
  resetBackgroundStore();
  backgroundStore.trackedTabsById = {
    1: makeTrackedTabRecord(1, { index: 0, videoDetails: { remainingTime: 5 }, isRemainingTimeStale: false }),
    2: makeTrackedTabRecord(2, { index: 1, videoDetails: { remainingTime: 15 }, isRemainingTimeStale: false }),
    3: makeTrackedTabRecord(3, {
      index: 2,
      isLiveStream: true,
      videoDetails: { remainingTime: null },
      isRemainingTimeStale: false,
    }),
  };

  recomputeSortState();

  assert.equal(backgroundStore.allSortableTabsSorted, true);
  assert.equal(backgroundStore.sortSummary.counts.tracked, 3);
  assert.equal(backgroundStore.sortSummary.counts.ready, 2);
  assert.equal(backgroundStore.sortSummary.order.allRemainingTimesKnown, true);
  assert.equal(backgroundStore.sortSummary.order.allSorted, true);
  assert.deepEqual(backgroundStore.targetOrder, [1, 2]);
});

test('pinned tracked tabs count toward popup totals without affecting sort summary', () => {
  resetBackgroundStore();
  backgroundStore.trackedTabsById = {
    1: makeTrackedTabRecord(1, {
      index: 0,
      pinned: true,
      videoDetails: { remainingTime: 30 },
      isRemainingTimeStale: false,
    }),
    2: makeTrackedTabRecord(2, {
      index: 1,
      videoDetails: { remainingTime: 5 },
      isRemainingTimeStale: false,
    }),
    3: makeTrackedTabRecord(3, {
      index: 2,
      videoDetails: { remainingTime: 15 },
      isRemainingTimeStale: false,
    }),
  };

  recomputeSortState();

  assert.equal(backgroundStore.allSortableTabsSorted, true);
  assert.equal(backgroundStore.sortSummary.counts.tracked, 3);
  assert.equal(backgroundStore.sortSummary.counts.ready, 2);
  assert.equal(backgroundStore.sortSummary.order.allRemainingTimesKnown, true);
  assert.equal(backgroundStore.sortSummary.order.allSorted, true);
  assert.deepEqual(backgroundStore.targetOrder, [2, 3]);
});
