import assert from 'node:assert/strict';
import test from 'node:test';

import { readonlyTrackedWindowState } from '../background/window-store.js';
import { recomputeSortState } from '../background/sort-state.js';
import {
  ensureChromeApi,
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedTabRecords,
} from './helpers/background-test-helpers.js';

ensureChromeApi();

test('orders known remaining-time tabs before unknown tabs', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 50 }, remainingTimeStale: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: null }, remainingTimeStale: true }),
    3: createTabRecordFixture(3, { index: 2, videoDetails: { remainingTime: 10 }, remainingTimeStale: false }),
  });

  recomputeSortState();

  assert.deepEqual(readonlyTrackedWindowState.targetVideoOrder, [3, 1, 2]);
  assert.deepEqual(readonlyTrackedWindowState.visibleTabIds, [1, 2, 3]);
  assert.equal(readonlyTrackedWindowState.currentOrderMatchesTarget, false);
});

test('marks window as sorted only when all actionable tabs are known and ordered', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 5 }, remainingTimeStale: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: 20 }, remainingTimeStale: false }),
  });

  recomputeSortState();

  assert.equal(readonlyTrackedWindowState.currentOrderMatchesTarget, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.order.allEligibleVideosReady, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.order.currentOrderMatchesTarget, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.sortReadyTabs.outOfOrder, false);
});

test('derives sort summary metrics for non-contiguous and out-of-order ready subsets', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, remainingTimeStale: true, isActiveTab: false, isHidden: true }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: 20 }, remainingTimeStale: false }),
    3: createTabRecordFixture(3, { index: 2, remainingTimeStale: true }),
    4: createTabRecordFixture(4, { index: 3, videoDetails: { remainingTime: 10 }, remainingTimeStale: false }),
  });

  recomputeSortState();

  assert.equal(readonlyTrackedWindowState.sortSummary.counts.sortReady, 2);
  assert.equal(readonlyTrackedWindowState.sortSummary.sortReadyTabs.atFront, false);
  assert.equal(readonlyTrackedWindowState.sortSummary.sortReadyTabs.contiguous, false);
  assert.equal(readonlyTrackedWindowState.sortSummary.sortReadyTabs.outOfOrder, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.inactiveTabs.hasStaleRemainingTime, true);
});

test('handles records without a finite index deterministically', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 8 }, remainingTimeStale: false }),
    2: createTabRecordFixture(2, { index: undefined, videoDetails: { remainingTime: 4 }, remainingTimeStale: false }),
    3: createTabRecordFixture(3, { index: undefined, videoDetails: { remainingTime: 2 }, remainingTimeStale: false }),
  });

  recomputeSortState();

  assert.deepEqual(readonlyTrackedWindowState.visibleTabIds, [1, 2, 3]);
  assert.deepEqual(readonlyTrackedWindowState.targetVideoOrder, [3, 2, 1]);
});

test('live tabs do not block sorted readiness for VOD tabs with known remaining times', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 5 }, remainingTimeStale: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: 15 }, remainingTimeStale: false }),
    3: createTabRecordFixture(3, {
      index: 2,
      isLiveNow: true,
      videoDetails: { remainingTime: null },
      remainingTimeStale: false,
    }),
  });

  recomputeSortState();

  assert.equal(readonlyTrackedWindowState.currentOrderMatchesTarget, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.counts.tracked, 3);
  assert.equal(readonlyTrackedWindowState.sortSummary.counts.sortReady, 2);
  assert.equal(readonlyTrackedWindowState.sortSummary.order.allEligibleVideosReady, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.order.currentOrderMatchesTarget, true);
  assert.deepEqual(readonlyTrackedWindowState.targetVideoOrder, [1, 2]);
});

test('pinned tracked tabs count toward popup totals without affecting sort summary', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      index: 0,
      pinned: true,
      videoDetails: { remainingTime: 30 },
      remainingTimeStale: false,
    }),
    2: createTabRecordFixture(2, {
      index: 1,
      videoDetails: { remainingTime: 5 },
      remainingTimeStale: false,
    }),
    3: createTabRecordFixture(3, {
      index: 2,
      videoDetails: { remainingTime: 15 },
      remainingTimeStale: false,
    }),
  });

  recomputeSortState();

  assert.equal(readonlyTrackedWindowState.currentOrderMatchesTarget, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.counts.tracked, 3);
  assert.equal(readonlyTrackedWindowState.sortSummary.counts.sortReady, 2);
  assert.equal(readonlyTrackedWindowState.sortSummary.order.allEligibleVideosReady, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.order.currentOrderMatchesTarget, true);
  assert.deepEqual(readonlyTrackedWindowState.targetVideoOrder, [2, 3]);
});
