import assert from 'node:assert/strict';
import test from 'node:test';

import { trackedWindowState } from '../background/tracked-window-state.js';
import { recomputeSortState } from '../background/sort-state.js';
import {
  ensureChromeApi,
  makeTabRecord,
  resetTrackedWindowState,
} from './helpers/background-test-helpers.js';

ensureChromeApi();

test('orders known remaining-time tabs before unknown tabs', () => {
  resetTrackedWindowState();
  trackedWindowState.tabRecordsById = {
    1: makeTabRecord(1, { index: 0, videoDetails: { remainingTime: 50 }, isRemainingTimeStale: false }),
    2: makeTabRecord(2, { index: 1, videoDetails: { remainingTime: null }, isRemainingTimeStale: true }),
    3: makeTabRecord(3, { index: 2, videoDetails: { remainingTime: 10 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.deepEqual(trackedWindowState.targetOrder, [3, 1, 2]);
  assert.deepEqual(trackedWindowState.visibleOrder, [1, 2, 3]);
  assert.equal(trackedWindowState.allSortableVodTabsSorted, false);
});

test('marks window as sorted only when all actionable tabs are known and ordered', () => {
  resetTrackedWindowState();
  trackedWindowState.tabRecordsById = {
    1: makeTabRecord(1, { index: 0, videoDetails: { remainingTime: 5 }, isRemainingTimeStale: false }),
    2: makeTabRecord(2, { index: 1, videoDetails: { remainingTime: 20 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.equal(trackedWindowState.allSortableVodTabsSorted, true);
  assert.equal(trackedWindowState.sortSummary.order.allSortableVodDurationsKnown, true);
  assert.equal(trackedWindowState.sortSummary.order.allSortableVodTabsSorted, true);
  assert.equal(trackedWindowState.sortSummary.readyTabs.outOfOrder, false);
});

test('derives sort summary metrics for non-contiguous and out-of-order ready subsets', () => {
  resetTrackedWindowState();
  trackedWindowState.tabRecordsById = {
    1: makeTabRecord(1, { index: 0, isRemainingTimeStale: true, isActiveTab: false, isHidden: true }),
    2: makeTabRecord(2, { index: 1, videoDetails: { remainingTime: 20 }, isRemainingTimeStale: false }),
    3: makeTabRecord(3, { index: 2, isRemainingTimeStale: true }),
    4: makeTabRecord(4, { index: 3, videoDetails: { remainingTime: 10 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.equal(trackedWindowState.sortSummary.counts.ready, 2);
  assert.equal(trackedWindowState.sortSummary.readyTabs.atFront, false);
  assert.equal(trackedWindowState.sortSummary.readyTabs.contiguous, false);
  assert.equal(trackedWindowState.sortSummary.readyTabs.outOfOrder, true);
  assert.equal(trackedWindowState.sortSummary.backgroundTabs.haveStaleRemainingTime, true);
});

test('handles records without a finite index deterministically', () => {
  resetTrackedWindowState();
  trackedWindowState.tabRecordsById = {
    1: makeTabRecord(1, { index: 0, videoDetails: { remainingTime: 8 }, isRemainingTimeStale: false }),
    2: makeTabRecord(2, { index: undefined, videoDetails: { remainingTime: 4 }, isRemainingTimeStale: false }),
    3: makeTabRecord(3, { index: undefined, videoDetails: { remainingTime: 2 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.deepEqual(trackedWindowState.visibleOrder, [1, 2, 3]);
  assert.deepEqual(trackedWindowState.targetOrder, [3, 2, 1]);
});

test('live tabs do not block sorted readiness for VOD tabs with known remaining times', () => {
  resetTrackedWindowState();
  trackedWindowState.tabRecordsById = {
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

  assert.equal(trackedWindowState.allSortableVodTabsSorted, true);
  assert.equal(trackedWindowState.sortSummary.counts.tracked, 3);
  assert.equal(trackedWindowState.sortSummary.counts.ready, 2);
  assert.equal(trackedWindowState.sortSummary.order.allSortableVodDurationsKnown, true);
  assert.equal(trackedWindowState.sortSummary.order.allSortableVodTabsSorted, true);
  assert.deepEqual(trackedWindowState.targetOrder, [1, 2]);
});

test('pinned tracked tabs count toward popup totals without affecting sort summary', () => {
  resetTrackedWindowState();
  trackedWindowState.tabRecordsById = {
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

  assert.equal(trackedWindowState.allSortableVodTabsSorted, true);
  assert.equal(trackedWindowState.sortSummary.counts.tracked, 3);
  assert.equal(trackedWindowState.sortSummary.counts.ready, 2);
  assert.equal(trackedWindowState.sortSummary.order.allSortableVodDurationsKnown, true);
  assert.equal(trackedWindowState.sortSummary.order.allSortableVodTabsSorted, true);
  assert.deepEqual(trackedWindowState.targetOrder, [2, 3]);
});
