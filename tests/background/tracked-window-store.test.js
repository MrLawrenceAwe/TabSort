import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getWritableTabRecord,
  getTabRecord,
  getTabRecordsById,
  trackedWindowStateView,
} from '../../background/tracked-window-store.js';
import {
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedTabRecords,
} from '../helpers/background-test-helpers.js';

test('public tracked window store access returns defensive copies', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      videoDetails: { title: 'Video 1', remainingTime: 20, lengthSeconds: 100 },
      remainingTimeStale: false,
    }),
  });

  trackedWindowStateView.tabRecordsById[1].videoDetails.remainingTime = 1;
  getTabRecordsById()[1].videoDetails.remainingTime = 2;
  getTabRecord(1).videoDetails.remainingTime = 3;

  assert.equal(getWritableTabRecord(1).videoDetails.remainingTime, 20);
});

test('writable tracked window store access is explicit for write paths', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      videoDetails: { title: 'Video 1', remainingTime: 20, lengthSeconds: 100 },
      remainingTimeStale: false,
    }),
  });

  getWritableTabRecord(1).videoDetails.remainingTime = 4;

  assert.equal(trackedWindowStateView.tabRecordsById[1].videoDetails.remainingTime, 4);
});
