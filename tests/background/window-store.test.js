import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getMutableTabRecord,
  getTabRecord,
  getTabRecordsById,
  getSortState,
  setSortState,
  setTabRecord,
  replaceAllTabRecords,
} from '../../background/windows/tracked-window-store.js';
import { buildTabSnapshot } from '../../background/tab-snapshot.js';
import {
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedTabRecords,
} from '../helpers/background-test-helpers.js';

test('public tracked window store access returns defensive copies', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      videoDetails: { title: 'Video 1', remainingSeconds: 20, lengthSeconds: 100 },
      remainingSecondsStale: false,
    }),
  });

  getTabRecordsById()[1].videoDetails.remainingSeconds = 2;
  getTabRecord(1).videoDetails.remainingSeconds = 3;

  assert.equal(getMutableTabRecord(1).videoDetails.remainingSeconds, 20);
});

test('writable tracked window store access is explicit for write paths', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      videoDetails: { title: 'Video 1', remainingSeconds: 20, lengthSeconds: 100 },
      remainingSecondsStale: false,
    }),
  });

  getMutableTabRecord(1).videoDetails.remainingSeconds = 4;

  assert.equal(getTabRecordsById()[1].videoDetails.remainingSeconds, 4);
});

test('sort reads and popup snapshots cannot mutate the background store', () => {
  resetTrackedWindowState();
  setTrackedTabRecords({ 1: createTabRecordFixture(1) });
  setSortState({
    trackedTabOrder: [1], targetVideoTabOrder: [1], sortSummary: { readyCount: 1 },
  });
  const state = getSortState();
  state.targetVideoTabOrder.push(2);
  state.trackedTabOrder.length = 0;
  state.sortSummary.readyCount = 99;
  const snapshot = buildTabSnapshot();
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'autoPreparation', 'isYouTubeLayoutOrganised', 'sortSummary', 'tabRecordsById', 'trackedTabOrder', 'windowId',
  ]);
  snapshot.trackedTabOrder.length = 0;
  snapshot.sortSummary.readyCount = 99;
  snapshot.tabRecordsById[1].videoDetails.title = 'Changed';
  assert.deepEqual(getSortState().targetVideoTabOrder, [1]);
  assert.deepEqual(getSortState().trackedTabOrder, [1]);
  assert.equal(getSortState().sortSummary.readyCount, 1);
  assert.equal(getTabRecord(1).videoDetails.title, 'Video 1');
});


test('record writes isolate caller inputs and returned snapshots', () => {
  resetTrackedWindowState();
  const record = createTabRecordFixture(1, {
    videoDetails: { title: 'Original', remainingSeconds: 20 },
  });
  const saved = setTabRecord(1, record);
  record.videoDetails.title = 'Changed input';
  saved.videoDetails.remainingSeconds = 99;
  assert.equal(getTabRecord(1).videoDetails.title, 'Original');
  assert.equal(getTabRecord(1).videoDetails.remainingSeconds, 20);

  const records = { 1: record };
  const snapshot = replaceAllTabRecords(records);
  record.videoDetails.title = 'Changed again';
  delete records[1];
  snapshot[1].videoDetails.remainingSeconds = 88;
  delete snapshot[1];
  assert.equal(getTabRecord(1).videoDetails.title, 'Changed input');
  assert.equal(getTabRecord(1).videoDetails.remainingSeconds, 20);
});
