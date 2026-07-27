import assert from 'node:assert/strict';
import test from 'node:test';

import { organiseTabs } from '../background/sorting/execute-sort.js';
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

test('organiseTabs returns move counts after organising tabs', { concurrency: false }, async () => {
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
    trackedTabOrder: [1, 2],
    targetVideoTabOrder: [2, 1],
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

  const result = await organiseTabs(1);

  assert.deepEqual(result, { ok: true, movedCount: 2, failedCount: 0 });
  assert.deepEqual(moves, [
    { tabId: [2, 1, 3], index: 0 },
  ]);
});

test('organiseTabs reports an atomic bulk move failure', { concurrency: false }, async () => {
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
  setTrackedSortState({ targetVideoTabOrder: [2, 1] });
  stubChromeTabQuery([createChromeTabFixture(1), createChromeTabFixture(2)]);

  globalThis.chrome.tabs.move = async () => {
    throw new Error('move failed');
  };

  const result = await organiseTabs(1);

  assert.equal(result.ok, false);
  assert.equal(result.movedCount, 0);
  assert.equal(result.failedCount, 2);
});

test('organiseTabs avoids Chrome move calls when the complete order already matches', { concurrency: false }, async () => {
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
  setTrackedSortState({ targetVideoTabOrder: [1, 2] });
  stubChromeTabQuery([
    createChromeTabFixture(1),
    createChromeTabFixture(2, { index: 1 }),
  ]);
  globalThis.chrome.tabs.move = async () => {
    throw new Error('already ordered tabs should not move');
  };

  const result = await organiseTabs(1);

  assert.deepEqual(result, { ok: true, movedCount: 0, failedCount: 0 });
});

test(
  'organiseTabs does not move tabs when its sync token is superseded during preparation',
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
      trackedTabOrder: [1, 2],
      targetVideoTabOrder: [2, 1],
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
    const pendingOrganisation = organiseTabs(1, { expectedSyncToken });
    nextSyncToken();

    const result = await pendingOrganisation;

    assert.deepEqual(result, {
      ok: false,
      movedCount: 0,
      skippedReason: 'windowSyncSuperseded',
    });
    assert.deepEqual(movedTabIds, []);
  },
);
