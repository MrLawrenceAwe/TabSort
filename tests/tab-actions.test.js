import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../shared/constants.js';
import { backgroundStore } from '../background/background-store.js';
import { reloadTab } from '../background/handlers/tab-actions.js';
import {
  ensureChromeApi,
  makeTrackedTabRecord,
  resetBackgroundStore,
} from './helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test('reloadTab does not mutate record state when chrome.tabs.reload fails', { concurrency: false }, async () => {
  resetBackgroundStore();
  backgroundStore.trackedVideoTabsById = {
    1: makeTrackedTabRecord(1, { videoDetails: { remainingTime: 100 }, isRemainingTimeStale: false }),
  };
  const before = JSON.parse(JSON.stringify(backgroundStore.trackedVideoTabsById[1]));

  globalThis.chrome.tabs.reload = async () => {
    throw new Error('reload failed');
  };

  await reloadTab({ tabId: 1, windowId: 1 });

  assert.deepEqual(backgroundStore.trackedVideoTabsById[1], before);
});

test('reloadTab marks record loading only after successful reload call', { concurrency: false }, async () => {
  resetBackgroundStore();
  backgroundStore.trackedVideoTabsById = {
    1: makeTrackedTabRecord(1, { videoDetails: { remainingTime: 100 }, isRemainingTimeStale: false }),
  };

  globalThis.chrome.tabs.reload = async () => {};

  await reloadTab({ tabId: 1, windowId: 1 });

  const record = backgroundStore.trackedVideoTabsById[1];
  assert.equal(record.status, TAB_STATES.LOADING);
  assert.equal(record.pageRuntimeReady, false);
  assert.equal(record.isRemainingTimeStale, true);
  assert.equal(record.videoDetails.remainingTime, null);
  assert.equal(typeof record.loadingStartedAt, 'number');
  assert.equal(typeof record.unsuspendedTimestamp, 'number');
});
