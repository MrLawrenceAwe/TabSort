import assert from 'node:assert/strict';
import test from 'node:test';

import { trackedWindowState } from '../../background/window-store.js';
import { getTabRecord, getTabRecordsById } from '../../background/window-store-selectors.js';
import { getMutableTabRecord } from '../../background/window-store-mutations.js';
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
      isRemainingTimeStale: false,
    }),
  });

  trackedWindowState.tabRecordsById[1].videoDetails.remainingTime = 1;
  getTabRecordsById()[1].videoDetails.remainingTime = 2;
  getTabRecord(1).videoDetails.remainingTime = 3;

  assert.equal(getMutableTabRecord(1).videoDetails.remainingTime, 20);
});

test('mutable window store access is explicit for write paths', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      videoDetails: { title: 'Video 1', remainingTime: 20, lengthSeconds: 100 },
      isRemainingTimeStale: false,
    }),
  });

  getMutableTabRecord(1).videoDetails.remainingTime = 4;

  assert.equal(trackedWindowState.tabRecordsById[1].videoDetails.remainingTime, 4);
});
