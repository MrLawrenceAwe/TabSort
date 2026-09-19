import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_LOAD_STATES } from '../../shared/tabs/load-states.js';
import {
  getSortState,
  getTabRecordsById,
  getTrackedWindowId,
} from '../../background/windows/tracked-window-store.js';
import { reconcileWindowTabRecords } from '../../background/tabs/reconcile-window.js';
import { saveAutoPreparedTab } from '../../background/auto-preparation/session-cache.js';
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

test('auto-prepared sleeping tabs remain sortable after visiting another window', async () => {
  const saved = {};
  chrome.storage = { session: {
    set: async values => Object.assign(saved, values),
    get: async () => ({ ...saved }),
  } };
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      loadState: TAB_LOAD_STATES.DISCARDED,
      videoDetails: { title: 'Prepared video', remainingSeconds: 45, lengthSeconds: 120 },
      remainingSecondsStale: false,
      hasAutoPreparedTime: true,
    }),
  });
  await saveAutoPreparedTab(getTabRecordsById()[1]);
  stubChromeTabQuery([createChromeTabFixture(1, { discarded: true })]);
  await reconcileWindowTabRecords(1, { force: true });
  stubChromeTabQuery([createChromeTabFixture(2, { windowId: 2, url: 'https://example.com/' })]);
  await reconcileWindowTabRecords(2, { force: true });
  stubChromeTabQuery([createChromeTabFixture(1, { discarded: true })]);
  await reconcileWindowTabRecords(1, { force: true });
  assert.equal(getSortState().sortSummary.readyCount, 1);
  assert.equal(getTabRecordsById()[1].videoDetails.title, 'Prepared video');
  resetTrackedWindowState(1);
  await reconcileWindowTabRecords(1, { force: true });
  assert.equal(getSortState().sortSummary.readyCount, 1);
  delete chrome.storage;
});

test(
  'reconcileWindowTabRecords does not mark already-open loaded tabs as recently loaded on initial rehydrate',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();

    stubChromeTabQuery([createChromeTabFixture(1)]);

    await reconcileWindowTabRecords(1, { force: true });

    const record = getTabRecordsById()[1];
    assert.equal(record.loadState, TAB_LOAD_STATES.LOADED);
    assert.equal(record.loadedAt, null);
  },
);

test(
  'reconcileWindowTabRecords keeps the recent load grace for real discarded-to-loaded transitions',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        loadState: TAB_LOAD_STATES.DISCARDED,
        loadedAt: null,
      }),
    });

    stubChromeTabQuery([createChromeTabFixture(1)]);

    await reconcileWindowTabRecords(1, { force: true });

    const record = getTabRecordsById()[1];
    assert.equal(record.loadState, TAB_LOAD_STATES.LOADED);
    assert.equal(typeof record.loadedAt, 'number');
  },
);

test(
  'reconcileWindowTabRecords keeps a trusted remaining time when a loaded tab is discarded',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        loadState: TAB_LOAD_STATES.LOADED,
        videoDetails: { title: 'Prepared video', remainingSeconds: 45, lengthSeconds: 120 },
        remainingSecondsStale: false,
        hasAutoPreparedTime: true,
      }),
    });

    stubChromeTabQuery([createChromeTabFixture(1, { discarded: true })]);

    await reconcileWindowTabRecords(1, { force: true });

    const record = getTabRecordsById()[1];
    assert.equal(record.loadState, TAB_LOAD_STATES.DISCARDED);
    assert.equal(record.videoDetails.remainingSeconds, 45);
    assert.equal(record.remainingSecondsStale, false);
    assert.equal(record.hasAutoPreparedTime, true);
    assert.equal(getSortState().sortSummary.readyCount, 1);
  },
);

test(
  'reconcileWindowTabRecords invalidates an ordinary discarded tab without an auto-preparation marker',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        videoDetails: { title: 'Ordinary video', remainingSeconds: 45, lengthSeconds: 120 },
        remainingSecondsStale: false,
      }),
    });

    stubChromeTabQuery([createChromeTabFixture(1, { discarded: true })]);
    await reconcileWindowTabRecords(1, { force: true });

    const record = getTabRecordsById()[1];
    assert.equal(record.videoDetails.remainingSeconds, null);
    assert.equal(record.remainingSecondsStale, true);
    assert.equal(record.hasAutoPreparedTime, false);
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
        playbackMetricsReady: true,
        contentScriptReady: true,
        videoDetails: { title: 'Old Video', remainingSeconds: 45, lengthSeconds: 120 },
        remainingSecondsStale: false,
      }),
    });

    stubChromeTabQuery([createChromeTabFixture(1, { url: 'https://www.youtube.com/watch?v=new' })]);

    await reconcileWindowTabRecords(1, { force: true });

    const record = getTabRecordsById()[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
    assert.equal(record.contentScriptReady, false);
    assert.equal(record.playbackMetricsReady, false);
    assert.equal(record.videoDetails, null);
    assert.equal(record.isLive, false);
    assert.equal(record.remainingSecondsStale, true);
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
        playbackMetricsReady: true,
        contentScriptReady: true,
        videoDetails: { title: 'Same Video', remainingSeconds: 45, lengthSeconds: 120 },
        remainingSecondsStale: false,
      }),
    });

    stubChromeTabQuery([
      createChromeTabFixture(1, {
        url: 'https://www.youtube.com/watch?v=same&list=abc123&index=10',
      }),
    ]);

    await reconcileWindowTabRecords(1, { force: true });

    const record = getTabRecordsById()[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=same&list=abc123&index=10');
    assert.equal(record.contentScriptReady, true);
    assert.equal(record.playbackMetricsReady, true);
    assert.deepEqual(record.videoDetails, {
      title: 'Same Video',
      remainingSeconds: 45,
      lengthSeconds: 120,
    });
    assert.equal(record.remainingSecondsStale, false);
  },
);

test(
  'reconcileWindowTabRecords preserves tracked state when the primary tab query fails',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        videoDetails: { title: 'Video 1', remainingSeconds: 90, lengthSeconds: 120 },
        remainingSecondsStale: false,
      }),
    });
    setTrackedSortState({ trackedTabOrder: [1] });
    setTrackedSortState({ targetVideoTabOrder: [1] });

    globalThis.chrome.tabs.query = async query => {
      if (query.hidden !== true) throw new Error('query failed');
      return [];
    };

    await reconcileWindowTabRecords(1, { force: true });

    assert.deepEqual(Object.keys(getTabRecordsById()), ['1']);
    assert.deepEqual(getSortState().trackedTabOrder, [1]);
    assert.deepEqual(getSortState().targetVideoTabOrder, [1]);
    assert.equal(getTabRecordsById()[1].videoDetails.remainingSeconds, 90);
  },
);

test(
  'reconcileWindowTabRecords does not switch tracked windows when a forced tab query fails',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        videoDetails: { title: 'Window 1 Video', remainingSeconds: 90, lengthSeconds: 120 },
        remainingSecondsStale: false,
      }),
    });
    setTrackedSortState({ trackedTabOrder: [1] });
    setTrackedSortState({ targetVideoTabOrder: [1] });

    stubChromeTabQueryFailure();

    await reconcileWindowTabRecords(2, { force: true });

    assert.equal(getTrackedWindowId(), 1);
    assert.deepEqual(Object.keys(getTabRecordsById()), ['1']);
    assert.deepEqual(getSortState().trackedTabOrder, [1]);
    assert.deepEqual(getSortState().targetVideoTabOrder, [1]);
  },
);

test(
  'reconcileWindowTabRecords resolves the concrete window for a last-focused query',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    stubChromeTabQuery([createChromeTabFixture(7, { windowId: 4 })]);

    const result = await reconcileWindowTabRecords(null, { force: true });

    assert.equal(result.ok, true);
    assert.equal(result.windowId, 4);
    assert.equal(getTrackedWindowId(), 4);
    assert.equal(getTabRecordsById()[7].windowId, 4);
  },
);
