import assert from 'node:assert/strict';
import test from 'node:test';

import { managedState } from '../background/managed-state.js';
import { recomputeSortState } from '../background/sort-state.js';
import {
  ensureChromeApi,
  makeTabRecord,
  resetManagedState,
} from './helpers/background-test-helpers.js';

ensureChromeApi();

test('orders known remaining-time tabs before unknown tabs', () => {
  resetManagedState();
  managedState.tabRecordsById = {
    1: makeTabRecord(1, { index: 0, videoDetails: { remainingTime: 50 }, isRemainingTimeStale: false }),
    2: makeTabRecord(2, { index: 1, videoDetails: { remainingTime: null }, isRemainingTimeStale: true }),
    3: makeTabRecord(3, { index: 2, videoDetails: { remainingTime: 10 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.deepEqual(managedState.targetOrder, [3, 1, 2]);
  assert.deepEqual(managedState.visibleOrder, [1, 2, 3]);
  assert.equal(managedState.allSortableTabsSorted, false);
});

test('marks window as sorted only when all actionable tabs are known and ordered', () => {
  resetManagedState();
  managedState.tabRecordsById = {
    1: makeTabRecord(1, { index: 0, videoDetails: { remainingTime: 5 }, isRemainingTimeStale: false }),
    2: makeTabRecord(2, { index: 1, videoDetails: { remainingTime: 20 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.equal(managedState.allSortableTabsSorted, true);
  assert.equal(managedState.sortSummary.order.allRemainingTimesKnown, true);
  assert.equal(managedState.sortSummary.order.allSorted, true);
  assert.equal(managedState.sortSummary.readyTabs.outOfOrder, false);
});

test('derives sort summary metrics for non-contiguous and out-of-order ready subsets', () => {
  resetManagedState();
  managedState.tabRecordsById = {
    1: makeTabRecord(1, { index: 0, isRemainingTimeStale: true, isActiveTab: false, isHidden: true }),
    2: makeTabRecord(2, { index: 1, videoDetails: { remainingTime: 20 }, isRemainingTimeStale: false }),
    3: makeTabRecord(3, { index: 2, isRemainingTimeStale: true }),
    4: makeTabRecord(4, { index: 3, videoDetails: { remainingTime: 10 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.equal(managedState.sortSummary.counts.ready, 2);
  assert.equal(managedState.sortSummary.readyTabs.atFront, false);
  assert.equal(managedState.sortSummary.readyTabs.contiguous, false);
  assert.equal(managedState.sortSummary.readyTabs.outOfOrder, true);
  assert.equal(managedState.sortSummary.backgroundTabs.haveStaleRemainingTime, true);
});

test('handles records without a finite index deterministically', () => {
  resetManagedState();
  managedState.tabRecordsById = {
    1: makeTabRecord(1, { index: 0, videoDetails: { remainingTime: 8 }, isRemainingTimeStale: false }),
    2: makeTabRecord(2, { index: undefined, videoDetails: { remainingTime: 4 }, isRemainingTimeStale: false }),
    3: makeTabRecord(3, { index: undefined, videoDetails: { remainingTime: 2 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.deepEqual(managedState.visibleOrder, [1, 2, 3]);
  assert.deepEqual(managedState.targetOrder, [3, 2, 1]);
});

test('live tabs do not block sorted readiness for VOD tabs with known remaining times', () => {
  resetManagedState();
  managedState.tabRecordsById = {
    1: makeTabRecord(1, { index: 0, videoDetails: { remainingTime: 5 }, isRemainingTimeStale: false }),
    2: makeTabRecord(2, { index: 1, videoDetails: { remainingTime: 15 }, isRemainingTimeStale: false }),
    3: makeTabRecord(3, {
      index: 2,
      isLiveStream: true,
      videoDetails: { remainingTime: null },
      isRemainingTimeStale: false,
    }),
  };

  recomputeSortState();

  assert.equal(managedState.allSortableTabsSorted, true);
  assert.equal(managedState.sortSummary.counts.tracked, 3);
  assert.equal(managedState.sortSummary.counts.ready, 2);
  assert.equal(managedState.sortSummary.order.allRemainingTimesKnown, true);
  assert.equal(managedState.sortSummary.order.allSorted, true);
  assert.deepEqual(managedState.targetOrder, [1, 2]);
});

test('pinned tracked tabs count toward popup totals without affecting sort summary', () => {
  resetManagedState();
  managedState.tabRecordsById = {
    1: makeTabRecord(1, {
      index: 0,
      pinned: true,
      videoDetails: { remainingTime: 30 },
      isRemainingTimeStale: false,
    }),
    2: makeTabRecord(2, {
      index: 1,
      videoDetails: { remainingTime: 5 },
      isRemainingTimeStale: false,
    }),
    3: makeTabRecord(3, {
      index: 2,
      videoDetails: { remainingTime: 15 },
      isRemainingTimeStale: false,
    }),
  };

  recomputeSortState();

  assert.equal(managedState.allSortableTabsSorted, true);
  assert.equal(managedState.sortSummary.counts.tracked, 3);
  assert.equal(managedState.sortSummary.counts.ready, 2);
  assert.equal(managedState.sortSummary.order.allRemainingTimesKnown, true);
  assert.equal(managedState.sortSummary.order.allSorted, true);
  assert.deepEqual(managedState.targetOrder, [2, 3]);
});
