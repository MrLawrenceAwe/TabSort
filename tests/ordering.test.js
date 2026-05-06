import assert from 'node:assert/strict';
import test from 'node:test';

import { trackedWindowState } from '../background/tracked-window-store.js';
import { recomputeSortState } from '../background/sort-state.js';
import {
  ensureChromeApi,
  createTabRecordFixture,
  resetTrackedWindowState,
} from './helpers/background-test-helpers.js';

ensureChromeApi();

test('orders known remaining-time tabs before unknown tabs', () => {
  resetTrackedWindowState();
  trackedWindowState.tabRecordsById = {
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 50 }, isRemainingTimeStale: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: null }, isRemainingTimeStale: true }),
    3: createTabRecordFixture(3, { index: 2, videoDetails: { remainingTime: 10 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.deepEqual(trackedWindowState.targetSortableTabIds, [3, 1, 2]);
  assert.deepEqual(trackedWindowState.visibleTabIds, [1, 2, 3]);
  assert.equal(trackedWindowState.currentOrderMatchesTarget, false);
});

test('marks window as sorted only when all actionable tabs are known and ordered', () => {
  resetTrackedWindowState();
  trackedWindowState.tabRecordsById = {
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 5 }, isRemainingTimeStale: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: 20 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.equal(trackedWindowState.currentOrderMatchesTarget, true);
  assert.equal(trackedWindowState.sortSummary.order.allSortableTabsReady, true);
  assert.equal(trackedWindowState.sortSummary.order.currentOrderMatchesTarget, true);
  assert.equal(trackedWindowState.sortSummary.sortReadyTabs.outOfOrder, false);
});

test('derives sort summary metrics for non-contiguous and out-of-order ready subsets', () => {
  resetTrackedWindowState();
  trackedWindowState.tabRecordsById = {
    1: createTabRecordFixture(1, { index: 0, isRemainingTimeStale: true, isActiveTab: false, isHidden: true }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: 20 }, isRemainingTimeStale: false }),
    3: createTabRecordFixture(3, { index: 2, isRemainingTimeStale: true }),
    4: createTabRecordFixture(4, { index: 3, videoDetails: { remainingTime: 10 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.equal(trackedWindowState.sortSummary.counts.sortReady, 2);
  assert.equal(trackedWindowState.sortSummary.sortReadyTabs.atFront, false);
  assert.equal(trackedWindowState.sortSummary.sortReadyTabs.contiguous, false);
  assert.equal(trackedWindowState.sortSummary.sortReadyTabs.outOfOrder, true);
  assert.equal(trackedWindowState.sortSummary.backgroundTabs.haveStaleRemainingTime, true);
});

test('handles records without a finite index deterministically', () => {
  resetTrackedWindowState();
  trackedWindowState.tabRecordsById = {
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 8 }, isRemainingTimeStale: false }),
    2: createTabRecordFixture(2, { index: undefined, videoDetails: { remainingTime: 4 }, isRemainingTimeStale: false }),
    3: createTabRecordFixture(3, { index: undefined, videoDetails: { remainingTime: 2 }, isRemainingTimeStale: false }),
  };

  recomputeSortState();

  assert.deepEqual(trackedWindowState.visibleTabIds, [1, 2, 3]);
  assert.deepEqual(trackedWindowState.targetSortableTabIds, [3, 2, 1]);
});

test('live tabs do not block sorted readiness for VOD tabs with known remaining times', () => {
  resetTrackedWindowState();
  trackedWindowState.tabRecordsById = {
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 5 }, isRemainingTimeStale: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: 15 }, isRemainingTimeStale: false }),
    3: createTabRecordFixture(3, {
      index: 2,
      isLiveNow: true,
      videoDetails: { remainingTime: null },
      isRemainingTimeStale: false,
    }),
  };

  recomputeSortState();

  assert.equal(trackedWindowState.currentOrderMatchesTarget, true);
  assert.equal(trackedWindowState.sortSummary.counts.tracked, 3);
  assert.equal(trackedWindowState.sortSummary.counts.sortReady, 2);
  assert.equal(trackedWindowState.sortSummary.order.allSortableTabsReady, true);
  assert.equal(trackedWindowState.sortSummary.order.currentOrderMatchesTarget, true);
  assert.deepEqual(trackedWindowState.targetSortableTabIds, [1, 2]);
});

test('pinned tracked tabs count toward popup totals without affecting sort summary', () => {
  resetTrackedWindowState();
  trackedWindowState.tabRecordsById = {
    1: createTabRecordFixture(1, {
      index: 0,
      pinned: true,
      videoDetails: { remainingTime: 30 },
      isRemainingTimeStale: false,
    }),
    2: createTabRecordFixture(2, {
      index: 1,
      videoDetails: { remainingTime: 5 },
      isRemainingTimeStale: false,
    }),
    3: createTabRecordFixture(3, {
      index: 2,
      videoDetails: { remainingTime: 15 },
      isRemainingTimeStale: false,
    }),
  };

  recomputeSortState();

  assert.equal(trackedWindowState.currentOrderMatchesTarget, true);
  assert.equal(trackedWindowState.sortSummary.counts.tracked, 3);
  assert.equal(trackedWindowState.sortSummary.counts.sortReady, 2);
  assert.equal(trackedWindowState.sortSummary.order.allSortableTabsReady, true);
  assert.equal(trackedWindowState.sortSummary.order.currentOrderMatchesTarget, true);
  assert.deepEqual(trackedWindowState.targetSortableTabIds, [2, 3]);
});
