import assert from 'node:assert/strict';
import test from 'node:test';

import { backgroundStore } from '../background/background-store.js';
import { recomputeSortState } from '../background/sort-state.js';
import {
  ensureChromeApi,
  makeTrackedTabRecord,
  resetBackgroundStore,
} from './helpers/background-test-helpers.js';

ensureChromeApi();

test('orders known remaining-time tabs before unknown tabs', () => {
  resetBackgroundStore();
  backgroundStore.trackedVideoTabsById = {
    1: makeTrackedTabRecord(1, { index: 0, videoDetails: { remainingTime: 50 }, isRemainingTimeStale: false }),
    2: makeTrackedTabRecord(2, { index: 1, videoDetails: { remainingTime: null }, isRemainingTimeStale: true }),
    3: makeTrackedTabRecord(3, { index: 2, videoDetails: { remainingTime: 10 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.deepEqual(backgroundStore.targetSortOrderTabIds, [3, 1, 2]);
  assert.deepEqual(backgroundStore.visibleTabOrderTabIds, [1, 2, 3]);
  assert.equal(backgroundStore.areTrackedTabsSorted, false);
});

test('marks window as sorted only when all actionable tabs are known and ordered', () => {
  resetBackgroundStore();
  backgroundStore.trackedVideoTabsById = {
    1: makeTrackedTabRecord(1, { index: 0, videoDetails: { remainingTime: 5 }, isRemainingTimeStale: false }),
    2: makeTrackedTabRecord(2, { index: 1, videoDetails: { remainingTime: 20 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.equal(backgroundStore.areTrackedTabsSorted, true);
  assert.equal(backgroundStore.readinessMetrics.areAllTimesKnown, true);
  assert.equal(backgroundStore.readinessMetrics.areAllSorted, true);
  assert.equal(backgroundStore.readinessMetrics.areReadyTabsOutOfOrder, false);
});

test('derives readiness metrics for non-contiguous and out-of-order ready subsets', () => {
  resetBackgroundStore();
  backgroundStore.trackedVideoTabsById = {
    1: makeTrackedTabRecord(1, { index: 0, isRemainingTimeStale: true, isActiveTab: false, isHidden: true }),
    2: makeTrackedTabRecord(2, { index: 1, videoDetails: { remainingTime: 20 }, isRemainingTimeStale: false }),
    3: makeTrackedTabRecord(3, { index: 2, isRemainingTimeStale: true }),
    4: makeTrackedTabRecord(4, { index: 3, videoDetails: { remainingTime: 10 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.equal(backgroundStore.readinessMetrics.readyTabCount, 2);
  assert.equal(backgroundStore.readinessMetrics.areReadyTabsAtFront, false);
  assert.equal(backgroundStore.readinessMetrics.areReadyTabsContiguous, false);
  assert.equal(backgroundStore.readinessMetrics.areReadyTabsOutOfOrder, true);
  assert.equal(backgroundStore.readinessMetrics.hasBackgroundTabsWithStaleRemaining, true);
});

test('handles records without a finite index deterministically', () => {
  resetBackgroundStore();
  backgroundStore.trackedVideoTabsById = {
    1: makeTrackedTabRecord(1, { index: 0, videoDetails: { remainingTime: 8 }, isRemainingTimeStale: false }),
    2: makeTrackedTabRecord(2, { index: undefined, videoDetails: { remainingTime: 4 }, isRemainingTimeStale: false }),
    3: makeTrackedTabRecord(3, { index: undefined, videoDetails: { remainingTime: 2 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.deepEqual(backgroundStore.visibleTabOrderTabIds, [1, 2, 3]);
  assert.deepEqual(backgroundStore.targetSortOrderTabIds, [3, 2, 1]);
});

test('live tabs do not block sorted readiness for VOD tabs with known remaining times', () => {
  resetBackgroundStore();
  backgroundStore.trackedVideoTabsById = {
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

  assert.equal(backgroundStore.areTrackedTabsSorted, true);
  assert.equal(backgroundStore.readinessMetrics.trackedTabCount, 2);
  assert.equal(backgroundStore.readinessMetrics.readyTabCount, 2);
  assert.equal(backgroundStore.readinessMetrics.areAllTimesKnown, true);
  assert.equal(backgroundStore.readinessMetrics.areAllSorted, true);
  assert.deepEqual(backgroundStore.targetSortOrderTabIds, [1, 2]);
});
