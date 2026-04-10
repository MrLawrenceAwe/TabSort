import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../shared/constants.js';
import { managedState } from '../background/managed-state.js';
import { reloadTab } from '../background/message-router.js';
import {
  ensureChromeApi,
  makeTabRecord,
  resetManagedState,
} from './helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test('reloadTab does not mutate record state when chrome.tabs.reload fails', { concurrency: false }, async () => {
  resetManagedState();
  managedState.tabRecordsById = {
    1: makeTabRecord(1, { videoDetails: { remainingTime: 100 }, isRemainingTimeStale: false }),
  };
  const before = JSON.parse(JSON.stringify(managedState.tabRecordsById[1]));

  globalThis.chrome.tabs.reload = async () => {
    throw new Error('reload failed');
  };

  await reloadTab({ tabId: 1, windowId: 1 });

  assert.deepEqual(managedState.tabRecordsById[1], before);
});

test('reloadTab marks record loading only after successful reload call', { concurrency: false }, async () => {
  resetManagedState();
  managedState.tabRecordsById = {
    1: makeTabRecord(1, { videoDetails: { remainingTime: 100 }, isRemainingTimeStale: false }),
  };

  globalThis.chrome.tabs.reload = async () => {};

  await reloadTab({ tabId: 1, windowId: 1 });

  const record = managedState.tabRecordsById[1];
  assert.equal(record.status, TAB_STATES.LOADING);
  assert.equal(record.pageRuntimeReady, false);
  assert.equal(record.isRemainingTimeStale, true);
  assert.equal(record.videoDetails.remainingTime, null);
  assert.equal(typeof record.loadingStartedAt, 'number');
  assert.equal(typeof record.unsuspendedTimestamp, 'number');
});
