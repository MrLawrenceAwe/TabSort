import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../shared/tab-states.js';
import { trackedWindowStateView } from '../background/tracked-window-store.js';
import { reloadTab } from '../background/tab-command-handlers.js';
import {
  ensureChromeApi,
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedTabRecords,
} from './helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test('reloadTab does not mutate record state when chrome.tabs.reload fails', { concurrency: false }, async () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { videoDetails: { remainingTime: 100 }, remainingTimeStale: false }),
  });
  const before = JSON.parse(JSON.stringify(trackedWindowStateView.tabRecordsById[1]));

  globalThis.chrome.tabs.reload = async () => {
    throw new Error('reload failed');
  };

  await reloadTab({ tabId: 1, windowId: 1 });

  assert.deepEqual(trackedWindowStateView.tabRecordsById[1], before);
});

test('reloadTab marks record loading only after successful reload call', { concurrency: false }, async () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { videoDetails: { remainingTime: 100 }, remainingTimeStale: false }),
  });

  globalThis.chrome.tabs.reload = async () => {};

  await reloadTab({ tabId: 1, windowId: 1 });

  const record = trackedWindowStateView.tabRecordsById[1];
  assert.equal(record.status, TAB_STATES.LOADING);
  assert.equal(record.contentScriptReported, false);
  assert.equal(record.remainingTimeStale, true);
  assert.equal(record.videoDetails.remainingTime, null);
  assert.equal(typeof record.loadingStartedAt, 'number');
  assert.equal(typeof record.unsuspendedTimestamp, 'number');
});
