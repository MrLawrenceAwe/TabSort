import assert from 'node:assert/strict';
import test from 'node:test';

import { trackedWindow } from '../background/windows/store.js';
import { recomputeSortState } from '../background/sorting/update-sort-state.js';
import {
  ensureChromeApi,
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedTabRecords,
  setTrackedWindowTabs,
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

  assert.deepEqual(trackedWindow.targetVideoTabOrder, [3, 1, 2]);
  assert.deepEqual(trackedWindow.trackedTabOrder, [1, 2, 3]);
  assert.equal(trackedWindow.isTargetOrderApplied, false);
});

test('marks window as sorted only when all actionable tabs are known and ordered', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 5 }, remainingTimeStale: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: 20 }, remainingTimeStale: false }),
  });

  recomputeSortState();

  assert.equal(trackedWindow.isTargetOrderApplied, true);
  assert.equal(trackedWindow.sortSummary.allSortableTabsReady, true);
  assert.equal(trackedWindow.sortSummary.readyTabsOutOfOrder, false);
});

test('does not call a single sortable tab a completed sort', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      index: 0,
      videoDetails: { remainingTime: 5 },
      remainingTimeStale: false,
    }),
  });

  recomputeSortState();

  assert.equal(trackedWindow.isTargetOrderApplied, false);
  assert.equal(trackedWindow.sortSummary.allSortableTabsReady, false);
});

test('derives sort summary metrics for non-contiguous and out-of-order ready subsets', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, remainingTimeStale: true, isActive: false, isHidden: true }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: 20 }, remainingTimeStale: false }),
    3: createTabRecordFixture(3, { index: 2, remainingTimeStale: true }),
    4: createTabRecordFixture(4, { index: 3, videoDetails: { remainingTime: 10 }, remainingTimeStale: false }),
  });

  recomputeSortState();

  assert.equal(trackedWindow.sortSummary.readyCount, 2);
  assert.equal(trackedWindow.sortSummary.readyTabsAtFront, false);
  assert.equal(trackedWindow.sortSummary.readyTabsContiguous, false);
  assert.equal(trackedWindow.sortSummary.readyTabsOutOfOrder, true);
});

test('handles records without a finite index deterministically', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 8 }, remainingTimeStale: false }),
    2: createTabRecordFixture(2, { index: undefined, videoDetails: { remainingTime: 4 }, remainingTimeStale: false }),
    3: createTabRecordFixture(3, { index: undefined, videoDetails: { remainingTime: 2 }, remainingTimeStale: false }),
  });

  recomputeSortState();

  assert.deepEqual(trackedWindow.trackedTabOrder, [1, 2, 3]);
  assert.deepEqual(trackedWindow.targetVideoTabOrder, [3, 2, 1]);
});

test('live tabs do not block sorted readiness for VOD tabs with known remaining times', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingTime: 5 }, remainingTimeStale: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingTime: 15 }, remainingTimeStale: false }),
    3: createTabRecordFixture(3, {
      index: 2,
      isLive: true,
      videoDetails: { remainingTime: null },
      remainingTimeStale: false,
    }),
  });

  recomputeSortState();

  assert.equal(trackedWindow.isTargetOrderApplied, true);
  assert.equal(trackedWindow.sortSummary.trackedCount, 3);
  assert.equal(trackedWindow.sortSummary.sortableCount, 2);
  assert.equal(trackedWindow.sortSummary.readyCount, 2);
  assert.equal(trackedWindow.sortSummary.allSortableTabsReady, true);
  assert.deepEqual(trackedWindow.targetVideoTabOrder, [1, 2]);
});

test('pinned tracked tabs are excluded from sortable readiness totals', () => {
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

  assert.equal(trackedWindow.isTargetOrderApplied, true);
  assert.equal(trackedWindow.sortSummary.trackedCount, 3);
  assert.equal(trackedWindow.sortSummary.sortableCount, 2);
  assert.equal(trackedWindow.sortSummary.readyCount, 2);
  assert.equal(trackedWindow.sortSummary.allSortableTabsReady, true);
  assert.deepEqual(trackedWindow.targetVideoTabOrder, [2, 3]);
});

test('does not mark videos sorted while non-YouTube tabs remain in front', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
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
  setTrackedWindowTabs([
    { id: 1, index: 0, pinned: false, url: 'https://example.com' },
    { id: 2, index: 1, pinned: false, url: 'https://www.youtube.com/watch?v=2' },
    { id: 3, index: 2, pinned: false, url: 'https://www.youtube.com/watch?v=3' },
  ]);

  recomputeSortState();

  assert.equal(trackedWindow.isTargetOrderApplied, false);
  assert.equal(trackedWindow.sortSummary.readyTabsAtFront, false);
});
