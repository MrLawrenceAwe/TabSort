import assert from 'node:assert/strict';
import test from 'node:test';

import { organiseTabs } from '../../background/sorting/organise-tabs.js';
import {
  nextSyncToken,
  resetTrackedWindowStore,
  replaceAllTabRecords,
} from '../../background/windows/tracked-window-store.js';
import {
  ensureChromeApi,
  createChromeTabFixture,
  createTabRecordFixture,
  setTrackedSortState,
  stubChromeTabQuery,
} from '../helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test('organiseTabs reports a completed order change', { concurrency: false }, async () => {
  resetTrackedWindowStore({ windowId: 1 });
  replaceAllTabRecords({
    1: createTabRecordFixture(1, {
      index: 0,
      videoDetails: { title: 'Video 1', remainingSeconds: 120, durationSeconds: 120 },
      remainingSecondsStale: false,
    }),
    2: createTabRecordFixture(2, {
      index: 1,
      videoDetails: { title: 'Video 2', remainingSeconds: 60, durationSeconds: 120 },
      remainingSecondsStale: false,
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

  assert.deepEqual(result, { ok: true, orderChanged: true });
  assert.deepEqual(moves, [
    { tabId: [2, 1, 3], index: 0 },
  ]);
});

test('organiseTabs reports a failed bulk move without inferred counts', { concurrency: false }, async () => {
  resetTrackedWindowStore({ windowId: 1 });
  replaceAllTabRecords({
    1: createTabRecordFixture(1, {
      videoDetails: { title: 'Video 1', remainingSeconds: 120, durationSeconds: 120 },
      remainingSecondsStale: false,
    }),
    2: createTabRecordFixture(2, {
      videoDetails: { title: 'Video 2', remainingSeconds: 60, durationSeconds: 120 },
      remainingSecondsStale: false,
    }),
  });
  setTrackedSortState({ targetVideoTabOrder: [2, 1] });
  stubChromeTabQuery([createChromeTabFixture(1), createChromeTabFixture(2)]);

  globalThis.chrome.tabs.move = async () => {
    throw new Error('move failed');
  };

  const result = await organiseTabs(1);

  assert.equal(result.ok, false);
  assert.deepEqual(result, { ok: false });
});

test('organiseTabs avoids Chrome move calls when the complete order already matches', { concurrency: false }, async () => {
  resetTrackedWindowStore({ windowId: 1 });
  replaceAllTabRecords({
    1: createTabRecordFixture(1, {
      videoDetails: { title: 'Video 1', remainingSeconds: 60, durationSeconds: 120 },
      remainingSecondsStale: false,
    }),
    2: createTabRecordFixture(2, {
      index: 1,
      videoDetails: { title: 'Video 2', remainingSeconds: 120, durationSeconds: 120 },
      remainingSecondsStale: false,
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

  assert.deepEqual(result, { ok: true, orderChanged: false });
});

test(
  'organiseTabs does not move tabs when its sync token is superseded while organising',
  { concurrency: false },
  async () => {
    resetTrackedWindowStore({ windowId: 1 });
    replaceAllTabRecords({
      1: createTabRecordFixture(1, {
        videoDetails: { title: 'Video 1', remainingSeconds: 120, durationSeconds: 120 },
        remainingSecondsStale: false,
      }),
      2: createTabRecordFixture(2, {
        videoDetails: { title: 'Video 2', remainingSeconds: 60, durationSeconds: 120 },
        remainingSecondsStale: false,
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
      skippedReason: 'windowSyncSuperseded',
    });
    assert.deepEqual(movedTabIds, []);
  },
);
