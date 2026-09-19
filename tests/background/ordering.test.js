import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveSortState } from '../../background/sorting/derive-state.js';

import {
  getSortState,
} from '../../background/windows/tracked-window-store.js';
import { updateSortStateAndBroadcast } from '../../background/sorting/update-sort-state.js';
import {
  ensureChromeApi,
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedTabRecords,
  setTrackedWindowTabs,
} from '../helpers/background-test-helpers.js';

ensureChromeApi();

test('ready prefix compares both placement and time order with or without tab-strip data', () => {
  const ready = (id, index, remainingSeconds) => createTabRecordFixture(id, {
    index, videoDetails: { remainingSeconds }, remainingSecondsStale: false,
  });
  const waiting = (id, index) => createTabRecordFixture(id, { index });
  const cases = [
    ['waiting before ready', [waiting(1, 0), ready(2, 1, 10), ready(3, 2, 20)], false],
    ['waiting between ready', [ready(1, 0, 10), waiting(2, 1), ready(3, 2, 20)], false],
    ['waiting after ready', [ready(1, 0, 10), ready(2, 1, 20), waiting(3, 2)], true],
    ['ready in reverse order', [ready(1, 0, 20), ready(2, 1, 10)], false],
    ['ready in order', [ready(1, 0, 10), ready(2, 1, 20)], true],
    ['no ready tabs', [waiting(1, 0)], true],
  ];
  for (const [label, records, expected] of cases) {
    for (const orderedWindowTabs of [[], records]) {
      const state = deriveSortState(records, { orderedWindowTabs });
      assert.equal(state.sortSummary.readyTabsLeadInOrder, expected, label);
    }
  }

  const records = [ready(2, 1, 10), ready(3, 2, 20)];
  const otherTab = { id: 1, index: 0, url: 'https://example.com' };
  assert.equal(deriveSortState(records, {
    orderedWindowTabs: [otherTab, ...records],
  }).sortSummary.readyTabsLeadInOrder, false);
  assert.equal(deriveSortState(records, {
    orderedWindowTabs: [{ ...otherTab, pinned: true }, ...records],
  }).sortSummary.readyTabsLeadInOrder, true);
});

test('orders known remaining-time tabs before unknown tabs', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingSeconds: 50 }, remainingSecondsStale: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingSeconds: null }, remainingSecondsStale: true }),
    3: createTabRecordFixture(3, { index: 2, videoDetails: { remainingSeconds: 10 }, remainingSecondsStale: false }),
  });

  updateSortStateAndBroadcast();

  assert.deepEqual(getSortState().targetVideoTabOrder, [3, 1, 2]);
  assert.deepEqual(getSortState().trackedTabOrder, [1, 2, 3]);
  assert.equal(getSortState().isYouTubeLayoutOrganised, false);
});

test('marks window as sorted only when all actionable tabs are known and ordered', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingSeconds: 5 }, remainingSecondsStale: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingSeconds: 20 }, remainingSecondsStale: false }),
  });

  updateSortStateAndBroadcast();

  assert.equal(getSortState().isYouTubeLayoutOrganised, true);

});

test('does not call a single sortable tab a completed sort', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      index: 0,
      videoDetails: { remainingSeconds: 5 },
      remainingSecondsStale: false,
    }),
  });

  updateSortStateAndBroadcast();

  assert.equal(getSortState().isYouTubeLayoutOrganised, false);
});

test('detects a ready prefix that differs from the sort plan', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, remainingSecondsStale: true, isActive: false, isHidden: true }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingSeconds: 20 }, remainingSecondsStale: false }),
    3: createTabRecordFixture(3, { index: 2, remainingSecondsStale: true }),
    4: createTabRecordFixture(4, { index: 3, videoDetails: { remainingSeconds: 10 }, remainingSecondsStale: false }),
  });

  updateSortStateAndBroadcast();

  assert.equal(getSortState().sortSummary.readyCount, 2);
  assert.equal(getSortState().sortSummary.readyTabsLeadInOrder, false);

});

test('handles records without a finite index deterministically', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingSeconds: 8 }, remainingSecondsStale: false }),
    2: createTabRecordFixture(2, { index: undefined, videoDetails: { remainingSeconds: 4 }, remainingSecondsStale: false }),
    3: createTabRecordFixture(3, { index: undefined, videoDetails: { remainingSeconds: 2 }, remainingSecondsStale: false }),
  });

  updateSortStateAndBroadcast();

  assert.deepEqual(getSortState().trackedTabOrder, [1, 2, 3]);
  assert.deepEqual(getSortState().targetVideoTabOrder, [3, 2, 1]);
});

test('live tabs do not block sorted readiness for VOD tabs with known remaining times', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, videoDetails: { remainingSeconds: 5 }, remainingSecondsStale: false }),
    2: createTabRecordFixture(2, { index: 1, videoDetails: { remainingSeconds: 15 }, remainingSecondsStale: false }),
    3: createTabRecordFixture(3, {
      index: 2,
      isLive: true,
      videoDetails: { remainingSeconds: null },
      remainingSecondsStale: false,
    }),
  });

  updateSortStateAndBroadcast();

  assert.equal(getSortState().isYouTubeLayoutOrganised, true);
  assert.equal(getSortState().sortSummary.sortableCount, 2);
  assert.equal(getSortState().sortSummary.readyCount, 2);
  assert.equal(getSortState().sortSummary.readyTabsLeadInOrder, true);
  assert.deepEqual(getSortState().targetVideoTabOrder, [1, 2]);
});

test('pinned tracked tabs are excluded from sortable readiness totals', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      index: 0,
      pinned: true,
      videoDetails: { remainingSeconds: 30 },
      remainingSecondsStale: false,
    }),
    2: createTabRecordFixture(2, {
      index: 1,
      videoDetails: { remainingSeconds: 5 },
      remainingSecondsStale: false,
    }),
    3: createTabRecordFixture(3, {
      index: 2,
      videoDetails: { remainingSeconds: 15 },
      remainingSecondsStale: false,
    }),
  });

  updateSortStateAndBroadcast();

  assert.equal(getSortState().isYouTubeLayoutOrganised, true);
  assert.equal(getSortState().sortSummary.sortableCount, 2);
  assert.equal(getSortState().sortSummary.readyCount, 2);
  assert.equal(getSortState().sortSummary.readyTabsLeadInOrder, true);
  assert.deepEqual(getSortState().targetVideoTabOrder, [2, 3]);
});

test('does not mark videos sorted while non-YouTube tabs remain in front', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    2: createTabRecordFixture(2, {
      index: 1,
      videoDetails: { remainingSeconds: 5 },
      remainingSecondsStale: false,
    }),
    3: createTabRecordFixture(3, {
      index: 2,
      videoDetails: { remainingSeconds: 15 },
      remainingSecondsStale: false,
    }),
  });
  setTrackedWindowTabs([
    { id: 1, index: 0, pinned: false, url: 'https://example.com' },
    { id: 2, index: 1, pinned: false, url: 'https://www.youtube.com/watch?v=2' },
    { id: 3, index: 2, pinned: false, url: 'https://www.youtube.com/watch?v=3' },
  ]);

  updateSortStateAndBroadcast();

  assert.equal(getSortState().isYouTubeLayoutOrganised, false);

});
