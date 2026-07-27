import assert from 'node:assert/strict';
import test from 'node:test';

import { sortTabs } from '../background/sorting/apply.js';
import { nextSyncToken } from '../background/windows/store.js';
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

  assert.deepEqual(result, { ok: true, movedCount: 2, failedCount: 0 });
  assert.deepEqual(moves, [
    { tabId: [2, 1, 3], index: 0 },
  ]);
});

test('sortTabs reports an atomic bulk move failure', { concurrency: false }, async () => {
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

  globalThis.chrome.tabs.move = async () => {
    throw new Error('move failed');
  };

  const result = await sortTabs(1);

  assert.equal(result.ok, false);
  assert.equal(result.movedCount, 0);
  assert.equal(result.failedCount, 2);
});

test('sortTabs avoids Chrome move calls when the complete order already matches', { concurrency: false }, async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      videoDetails: { title: 'Video 1', remainingTime: 60, lengthSeconds: 120 },
      remainingTimeStale: false,
    }),
    2: createTabRecordFixture(2, {
      index: 1,
      videoDetails: { title: 'Video 2', remainingTime: 120, lengthSeconds: 120 },
      remainingTimeStale: false,
    }),
  });
  setTrackedSortState({ plannedVideoTabOrder: [1, 2] });
  stubChromeTabQuery([
    createChromeTabFixture(1),
    createChromeTabFixture(2, { index: 1 }),
  ]);
  globalThis.chrome.tabs.move = async () => {
    throw new Error('already ordered tabs should not move');
  };

  const result = await sortTabs(1);

  assert.deepEqual(result, { ok: true, movedCount: 0, failedCount: 0 });
});

test(
  'sortTabs does not move tabs when its sync token is superseded during preparation',
  { concurrency: false },
  async () => {
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
    setTrackedSortState({
      trackedTabIdsInWindowOrder: [1, 2],
      plannedVideoTabOrder: [2, 1],
    });
    stubChromeTabQuery([
      createChromeTabFixture(1),
      createChromeTabFixture(2, { index: 1 }),
    ]);

    const movedTabIds = [];
    globalThis.chrome.tabs.move = async (tabId) => {
      movedTabIds.push(tabId);
    };

    const expectedSyncToken = nextSyncToken();
    const pendingSort = sortTabs(1, { expectedSyncToken });
    nextSyncToken();

    const result = await pendingSort;

    assert.deepEqual(result, {
      ok: false,
      movedCount: 0,
      skippedReason: 'windowSyncSuperseded',
    });
    assert.deepEqual(movedTabIds, []);
  },
);
