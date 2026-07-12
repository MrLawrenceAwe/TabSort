import assert from 'node:assert/strict';
import test from 'node:test';

import { sortTabs } from '../background/sorting/apply.js';
import {
  ensureChromeApi,
  createChromeTabFixture,
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedSortState,
  setTrackedTabRecords,
  stubChromeTabQuery,
} from './helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test('sortTabs returns move counts after sorting tabs', { concurrency: false }, async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      index: 0,
      videoDetails: { title: 'Video 1', remainingTime: 120, lengthSeconds: 120 },
      remainingTimeStale: false,
    }),
    2: createTabRecordFixture(2, {
      index: 1,
      videoDetails: { title: 'Video 2', remainingTime: 60, lengthSeconds: 120 },
      remainingTimeStale: false,
    }),
  });
  setTrackedSortState({
    trackedTabIdsInWindowOrder: [1, 2],
    plannedVideoTabOrder: [2, 1],
  });
  stubChromeTabQuery([
    createChromeTabFixture(1, { index: 0 }),
    createChromeTabFixture(2, { index: 1 }),
    { id: 3, windowId: 1, url: 'https://example.com', index: 2, pinned: false },
  ]);

  const moves = [];
  globalThis.chrome.tabs.move = async (tabId, options) => {
    moves.push({ tabId, index: options.index });
  };

  const result = await sortTabs(1);

  assert.deepEqual(result, { ok: true, movedCount: 3, failedCount: 0 });
  assert.deepEqual(moves, [
    { tabId: 2, index: 0 },
    { tabId: 1, index: 1 },
    { tabId: 3, index: 2 },
  ]);
});

test('sortTabs reports partial move failures', { concurrency: false }, async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      videoDetails: { title: 'Video 1', remainingTime: 120, lengthSeconds: 120 },
      remainingTimeStale: false,
    }),
    2: createTabRecordFixture(2, {
      videoDetails: { title: 'Video 2', remainingTime: 60, lengthSeconds: 120 },
      remainingTimeStale: false,
    }),
  });
  setTrackedSortState({ plannedVideoTabOrder: [2, 1] });
  stubChromeTabQuery([createChromeTabFixture(1), createChromeTabFixture(2)]);

  globalThis.chrome.tabs.move = async (tabId) => {
    if (tabId === 1) throw new Error('move failed');
  };

  const result = await sortTabs(1);

  assert.equal(result.ok, false);
  assert.equal(result.movedCount, 1);
  assert.equal(result.failedCount, 1);
});
