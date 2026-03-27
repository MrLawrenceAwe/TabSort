import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../shared/constants.js';
import { backgroundStore } from '../background/store.js';
import { reloadTabMessage } from '../background/messages.js';
import {
  ensureChromeApi,
  makeTrackedTabRecord,
  resetBackgroundStore,
} from './helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test('reloadTabMessage does not mutate record state when chrome.tabs.reload fails', { concurrency: false }, async () => {
  resetBackgroundStore();
  backgroundStore.trackedTabsById = {
    1: makeTrackedTabRecord(1, { videoDetails: { remainingTime: 100 }, isRemainingTimeStale: false }),
  };
  const before = JSON.parse(JSON.stringify(backgroundStore.trackedTabsById[1]));

  globalThis.chrome.tabs.reload = async () => {
    throw new Error('reload failed');
  };

  await reloadTabMessage({ tabId: 1, windowId: 1 });

  assert.deepEqual(backgroundStore.trackedTabsById[1], before);
});

test('reloadTabMessage marks record loading only after successful reload call', { concurrency: false }, async () => {
  resetBackgroundStore();
  backgroundStore.trackedTabsById = {
    1: makeTrackedTabRecord(1, { videoDetails: { remainingTime: 100 }, isRemainingTimeStale: false }),
  };

  globalThis.chrome.tabs.reload = async () => {};

  await reloadTabMessage({ tabId: 1, windowId: 1 });

  const record = backgroundStore.trackedTabsById[1];
  assert.equal(record.status, TAB_STATES.LOADING);
  assert.equal(record.pageRuntimeReady, false);
  assert.equal(record.isRemainingTimeStale, true);
  assert.equal(record.videoDetails.remainingTime, null);
  assert.equal(typeof record.loadingStartedAt, 'number');
  assert.equal(typeof record.unsuspendedTimestamp, 'number');
});
