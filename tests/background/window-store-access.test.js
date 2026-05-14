import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMutableTabRecord,
  getTabRecord,
  getTabRecordsById,
  readonlyTrackedWindowState,
} from '../../background/window-store.js';
import {
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedTabRecords,
} from '../helpers/background-test-helpers.js';

test('public window store access returns defensive copies', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      videoDetails: { title: 'Video 1', remainingTime: 20, lengthSeconds: 100 },
      remainingTimeStale: false,
    }),
  });

  readonlyTrackedWindowState.tabRecordsById[1].videoDetails.remainingTime = 1;
  getTabRecordsById()[1].videoDetails.remainingTime = 2;
  getTabRecord(1).videoDetails.remainingTime = 3;

  assert.equal(getMutableTabRecord(1).videoDetails.remainingTime, 20);
});

test('mutable window store access is explicit for write paths', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      videoDetails: { title: 'Video 1', remainingTime: 20, lengthSeconds: 100 },
      remainingTimeStale: false,
    }),
  });

  getMutableTabRecord(1).videoDetails.remainingTime = 4;

  assert.equal(readonlyTrackedWindowState.tabRecordsById[1].videoDetails.remainingTime, 4);
});
