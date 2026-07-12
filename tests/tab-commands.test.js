import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_LOAD_STATES } from '../shared/tabs/load-states.js';
import { trackedWindow } from '../background/windows/store.js';
import { handleSortTabs, reloadTab } from '../background/messaging/tab-commands.js';
import {
  ensureChromeApi,
  createChromeTabFixture,
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedSortState,
  setTrackedTabRecords,
} from './helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test('reloadTab does not mutate record state when chrome.tabs.reload fails', { concurrency: false }, async () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { videoDetails: { remainingTime: 100 }, remainingTimeStale: false }),
  });
  const before = JSON.parse(JSON.stringify(trackedWindow.tabRecordsById[1]));

  globalThis.chrome.tabs.reload = async () => {
    throw new Error('reload failed');
  };

  await reloadTab({ tabId: 1, windowId: 1 });

  assert.deepEqual(trackedWindow.tabRecordsById[1], before);
});

test('reloadTab marks record loading only after successful reload call', { concurrency: false }, async () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { videoDetails: { remainingTime: 100 }, remainingTimeStale: false }),
  });

  globalThis.chrome.tabs.reload = async () => {};

  await reloadTab({ tabId: 1, windowId: 1 });

  const record = trackedWindow.tabRecordsById[1];
  assert.equal(record.loadState, TAB_LOAD_STATES.LOADING);
  assert.equal(record.pageRuntimeReady, false);
  assert.equal(record.remainingTimeStale, true);
  assert.equal(record.videoDetails.remainingTime, null);
  assert.equal(typeof record.loadingStartedAt, 'number');
  assert.equal(typeof record.unsuspendedTimestamp, 'number');
});

test('handleSortTabs refreshes a newly targeted window before deriving its sort', { concurrency: false }, async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      videoDetails: { remainingTime: 120 },
      remainingTimeStale: false,
    }),
    2: createTabRecordFixture(2, {
      videoDetails: { remainingTime: 60 },
      remainingTimeStale: false,
    }),
  });
  setTrackedSortState({ plannedVideoTabOrder: [2, 1] });

  const queriedWindowIds = [];
  globalThis.chrome.tabs.query = (query, callback) => {
    queriedWindowIds.push(query.windowId);
    callback([
      createChromeTabFixture(10, { windowId: 2, index: 0 }),
      createChromeTabFixture(11, { windowId: 2, index: 1 }),
    ]);
  };
  const movedTabIds = [];
  globalThis.chrome.tabs.move = async (tabId) => {
    movedTabIds.push(tabId);
  };

  const result = await handleSortTabs({ windowId: 2 });

  assert.deepEqual(result, {
    ok: true,
    movedCount: 0,
    skippedReason: 'notEnoughReadyTabs',
  });
  assert.deepEqual(movedTabIds, []);
  assert.deepEqual(queriedWindowIds, [2, 2]);
  assert.equal(trackedWindow.windowId, 2);
  assert.deepEqual(Object.keys(trackedWindow.tabRecordsById).map(Number), [10, 11]);
});
