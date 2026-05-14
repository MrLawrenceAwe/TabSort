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
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 50 }, remainingTimeNeedsRefresh: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: null }, remainingTimeNeedsRefresh: true }),
    3: createTabRecordFixture(3, { index: 2, videoDetails: { remainingTime: 10 }, remainingTimeNeedsRefresh: false }),
  });

  recomputeSortState();

  assert.deepEqual(readonlyTrackedWindowState.targetSortableTabIds, [3, 1, 2]);
  assert.deepEqual(readonlyTrackedWindowState.visibleTabIds, [1, 2, 3]);
  assert.equal(readonlyTrackedWindowState.currentOrderMatchesTarget, false);
});

test('marks window as sorted only when all actionable tabs are known and ordered', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 5 }, remainingTimeNeedsRefresh: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: 20 }, remainingTimeNeedsRefresh: false }),
  });

  recomputeSortState();

  assert.equal(readonlyTrackedWindowState.currentOrderMatchesTarget, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.order.allSortableTabsReady, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.order.currentOrderMatchesTarget, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.sortReadyTabs.outOfOrder, false);
});

test('derives sort summary metrics for non-contiguous and out-of-order ready subsets', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, remainingTimeNeedsRefresh: true, isActiveTab: false, isHidden: true }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: 20 }, remainingTimeNeedsRefresh: false }),
    3: createTabRecordFixture(3, { index: 2, remainingTimeNeedsRefresh: true }),
    4: createTabRecordFixture(4, { index: 3, videoDetails: { remainingTime: 10 }, remainingTimeNeedsRefresh: false }),
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
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 8 }, remainingTimeNeedsRefresh: false }),
    2: createTabRecordFixture(2, { index: undefined, videoDetails: { remainingTime: 4 }, remainingTimeNeedsRefresh: false }),
    3: createTabRecordFixture(3, { index: undefined, videoDetails: { remainingTime: 2 }, remainingTimeNeedsRefresh: false }),
  });

  recomputeSortState();

  assert.deepEqual(readonlyTrackedWindowState.visibleTabIds, [1, 2, 3]);
  assert.deepEqual(readonlyTrackedWindowState.targetSortableTabIds, [3, 2, 1]);
});

test('live tabs do not block sorted readiness for VOD tabs with known remaining times', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 5 }, remainingTimeNeedsRefresh: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: 15 }, remainingTimeNeedsRefresh: false }),
    3: createTabRecordFixture(3, {
      index: 2,
      isLiveNow: true,
      videoDetails: { remainingTime: null },
      remainingTimeNeedsRefresh: false,
    }),
  });

  recomputeSortState();

  assert.equal(readonlyTrackedWindowState.currentOrderMatchesTarget, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.counts.tracked, 3);
  assert.equal(readonlyTrackedWindowState.sortSummary.counts.sortReady, 2);
  assert.equal(readonlyTrackedWindowState.sortSummary.order.allSortableTabsReady, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.order.currentOrderMatchesTarget, true);
  assert.deepEqual(readonlyTrackedWindowState.targetSortableTabIds, [1, 2]);
});

test('pinned tracked tabs count toward popup totals without affecting sort summary', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      index: 0,
      pinned: true,
      videoDetails: { remainingTime: 30 },
      remainingTimeNeedsRefresh: false,
    }),
    2: createTabRecordFixture(2, {
      index: 1,
      videoDetails: { remainingTime: 5 },
      remainingTimeNeedsRefresh: false,
    }),
    3: createTabRecordFixture(3, {
      index: 2,
      videoDetails: { remainingTime: 15 },
      remainingTimeNeedsRefresh: false,
    }),
  });

  recomputeSortState();

  assert.equal(readonlyTrackedWindowState.currentOrderMatchesTarget, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.counts.tracked, 3);
  assert.equal(readonlyTrackedWindowState.sortSummary.counts.sortReady, 2);
  assert.equal(readonlyTrackedWindowState.sortSummary.order.allSortableTabsReady, true);
  assert.equal(readonlyTrackedWindowState.sortSummary.order.currentOrderMatchesTarget, true);
  assert.deepEqual(readonlyTrackedWindowState.targetSortableTabIds, [2, 3]);
});
