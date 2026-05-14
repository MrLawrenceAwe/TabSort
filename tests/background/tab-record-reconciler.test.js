import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../../shared/tab-states.js';
import { trackedWindowSnapshot } from '../../background/tracked-window-store.js';
import { reconcileWindowTabRecords } from '../../background/tab-record-reconciler.js';
import {
  ensureChromeApi,
  createChromeTabFixture,
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedTabRecords,
  setTrackedSortState,
  stubChromeTabQuery,
  stubChromeTabQueryFailure,
} from '../helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test(
  'reconcileWindowTabRecords does not mark already-open unsuspended tabs as recently unsuspended on initial rehydrate',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();

    stubChromeTabQuery([createChromeTabFixture(1)]);

    await reconcileWindowTabRecords(1, { force: true });

    const record = trackedWindowSnapshot.tabRecordsById[1];
    assert.equal(record.status, TAB_STATES.UNSUSPENDED);
    assert.equal(record.unsuspendedTimestamp, null);
  },
);

test(
  'reconcileWindowTabRecords keeps the recent unsuspend grace for real suspended-to-unsuspended transitions',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        status: TAB_STATES.SUSPENDED,
        unsuspendedTimestamp: null,
      }),
    });

    stubChromeTabQuery([createChromeTabFixture(1)]);

    await reconcileWindowTabRecords(1, { force: true });

    const record = trackedWindowSnapshot.tabRecordsById[1];
    assert.equal(record.status, TAB_STATES.UNSUSPENDED);
    assert.equal(typeof record.unsuspendedTimestamp, 'number');
  },
);

test(
  'reconcileWindowTabRecords resets runtime readiness when a tracked tab navigates to a new video URL',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=old',
        mediaElementObserved: true,
        contentScriptReported: true,
        videoDetails: { title: 'Old Video', remainingTime: 45, lengthSeconds: 120 },
        remainingTimeStale: false,
      }),
    });

    stubChromeTabQuery([createChromeTabFixture(1, { url: 'https://www.youtube.com/watch?v=new' })]);

    await reconcileWindowTabRecords(1, { force: true });

    const record = trackedWindowSnapshot.tabRecordsById[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
    assert.equal(record.contentScriptReported, false);
    assert.equal(record.mediaElementObserved, false);
    assert.equal(record.videoDetails, null);
    assert.equal(record.isLiveNow, false);
    assert.equal(record.remainingTimeStale, true);
    assert.equal(typeof record.transitionStartedAt, 'number');
  },
);

test(
  'reconcileWindowTabRecords preserves readiness when only watch URL parameters change',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        url: 'https://www.youtube.com/watch?v=same',
        mediaElementObserved: true,
        contentScriptReported: true,
        videoDetails: { title: 'Same Video', remainingTime: 45, lengthSeconds: 120 },
        remainingTimeStale: false,
      }),
    });

    stubChromeTabQuery([
      createChromeTabFixture(1, {
        url: 'https://www.youtube.com/watch?v=same&list=abc123&index=10',
      }),
    ]);

    await reconcileWindowTabRecords(1, { force: true });

    const record = trackedWindowSnapshot.tabRecordsById[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=same&list=abc123&index=10');
    assert.equal(record.contentScriptReported, true);
    assert.equal(record.mediaElementObserved, true);
    assert.deepEqual(record.videoDetails, {
      title: 'Same Video',
      remainingTime: 45,
      lengthSeconds: 120,
    });
    assert.equal(record.remainingTimeStale, false);
  },
);

test(
  'reconcileWindowTabRecords preserves tracked state when the primary tab query fails',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        videoDetails: { title: 'Video 1', remainingTime: 90, lengthSeconds: 120 },
        remainingTimeStale: false,
      }),
    });
    setTrackedSortState({ trackedTabIdsInWindowOrder: [1] });
    setTrackedSortState({ targetVideoTabOrder: [1] });

    globalThis.chrome.tabs.query = (query, callback) => {
      globalThis.chrome.runtime.lastError =
        query.hidden === true ? null : new Error('query failed');
      callback([]);
      globalThis.chrome.runtime.lastError = null;
    };

    await reconcileWindowTabRecords(1, { force: true });

    assert.deepEqual(Object.keys(trackedWindowSnapshot.tabRecordsById), ['1']);
    assert.deepEqual(trackedWindowSnapshot.trackedTabIdsInWindowOrder, [1]);
    assert.deepEqual(trackedWindowSnapshot.targetVideoTabOrder, [1]);
    assert.equal(trackedWindowSnapshot.tabRecordsById[1].videoDetails.remainingTime, 90);
  },
);

test(
  'reconcileWindowTabRecords does not switch tracked windows when a forced tab query fails',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        videoDetails: { title: 'Window 1 Video', remainingTime: 90, lengthSeconds: 120 },
        remainingTimeStale: false,
      }),
    });
    setTrackedSortState({ trackedTabIdsInWindowOrder: [1] });
    setTrackedSortState({ targetVideoTabOrder: [1] });

    stubChromeTabQueryFailure();

    await reconcileWindowTabRecords(2, { force: true });

    assert.equal(trackedWindowSnapshot.windowId, 1);
    assert.deepEqual(Object.keys(trackedWindowSnapshot.tabRecordsById), ['1']);
    assert.deepEqual(trackedWindowSnapshot.trackedTabIdsInWindowOrder, [1]);
    assert.deepEqual(trackedWindowSnapshot.targetVideoTabOrder, [1]);
  },
);
