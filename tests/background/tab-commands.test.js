import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_LOAD_STATES } from '../../shared/tabs/load-states.js';
import {
  getTabRecordsById,
  getTrackedWindowId,
} from '../../background/windows/store.js';
import {
  getWindowSnapshot,
  handleOrganiseTabs,
  activateTab,
  reloadTab,
} from '../../background/messaging/tab-commands.js';
import { reconcileWindowTabRecords } from '../../background/tabs/reconcile-window.js';
import {
  ensureChromeApi,
  createChromeTabFixture,
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedSortState,
  setTrackedTabRecords,
} from '../helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test('reloadTab does not mutate record state when chrome.tabs.reload fails', { concurrency: false }, async () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { videoDetails: { remainingSeconds: 100 }, remainingSecondsStale: false }),
  });
  const before = JSON.parse(JSON.stringify(getTabRecordsById()[1]));

  globalThis.chrome.tabs.reload = async () => {
    throw new Error('reload failed');
  };

  const result = await reloadTab({ tabId: 1, windowId: 1 });

  assert.deepEqual(getTabRecordsById()[1], before);
  assert.deepEqual(result, { ok: false, error: 'reloadFailed', tabId: 1 });
});

test('reloadTab marks record loading only after successful reload call', { concurrency: false }, async () => {
  resetTrackedWindowState();
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { videoDetails: { remainingSeconds: 100 }, remainingSecondsStale: false }),
  });

  globalThis.chrome.tabs.reload = async () => {};

  const result = await reloadTab({ tabId: 1, windowId: 1 });

  const record = getTabRecordsById()[1];
  assert.equal(record.loadState, TAB_LOAD_STATES.LOADING);
  assert.equal(record.contentScriptReady, false);
  assert.equal(record.remainingSecondsStale, true);
  assert.equal(record.videoDetails.remainingSeconds, null);
  assert.equal(typeof record.loadingStartedAt, 'number');
  assert.equal(record.loadedAt, null);
  assert.deepEqual(result, { ok: true, tabId: 1 });
});

test('tab actions reject records outside the popup window', { concurrency: false }, async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { windowId: 1 }),
  });
  globalThis.chrome.tabs.update = async () => {
    throw new Error('should not update a mismatched tab');
  };

  const result = await activateTab({ tabId: 1, windowId: 2 });

  assert.deepEqual(result, { ok: false, error: 'windowMismatch' });
});

test('activateTab returns a structured success result', { concurrency: false }, async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { windowId: 1 }),
  });
  globalThis.chrome.tabs.update = async () => {};

  const result = await activateTab({ tabId: 1, windowId: 1 });

  assert.deepEqual(result, { ok: true, tabId: 1 });
});

test('handleOrganiseTabs refreshes a newly targeted window before deriving its sort', { concurrency: false }, async () => {
  resetTrackedWindowState(1);
  setTrackedTabRecords({
    1: createTabRecordFixture(1, {
      videoDetails: { remainingSeconds: 120 },
      remainingSecondsStale: false,
    }),
    2: createTabRecordFixture(2, {
      videoDetails: { remainingSeconds: 60 },
      remainingSecondsStale: false,
    }),
  });
  setTrackedSortState({ targetVideoTabOrder: [2, 1] });

  const queriedWindowIds = [];
  globalThis.chrome.tabs.query = async query => {
    queriedWindowIds.push(query.windowId);
    return [
      createChromeTabFixture(10, { windowId: 2, index: 0 }),
      createChromeTabFixture(11, { windowId: 2, index: 1 }),
    ];
  };
  const movedTabIds = [];
  globalThis.chrome.tabs.move = async (tabId) => {
    movedTabIds.push(tabId);
  };

  const result = await handleOrganiseTabs({ windowId: 2 });

  assert.deepEqual(result, {
    ok: true,
    movedCount: 0,
    skippedReason: 'notEnoughReadyTabs',
  });
  assert.deepEqual(movedTabIds, []);
  assert.deepEqual(queriedWindowIds, [2, 2]);
  assert.equal(getTrackedWindowId(), 2);
  assert.deepEqual(Object.keys(getTabRecordsById()).map(Number), [10, 11]);
});

test(
  'getWindowSnapshot does not return another window when its reconciliation is superseded',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    const queryCallbacks = new Map();
    globalThis.chrome.tabs.query = query =>
      new Promise(resolve => { queryCallbacks.set(query.windowId, resolve); });

    const requestForWindow1 = getWindowSnapshot({ windowId: 1 });
    await Promise.resolve();
    const requestForWindow2 = getWindowSnapshot({ windowId: 2 });
    await Promise.resolve();

    queryCallbacks.get(2)([
      createChromeTabFixture(20, {
        windowId: 2,
        discarded: true,
      }),
    ]);
    const window2Snapshot = await requestForWindow2;
    queryCallbacks.get(1)([
      createChromeTabFixture(10, {
        windowId: 1,
        discarded: true,
      }),
    ]);
    const window1Response = await requestForWindow1;

    assert.deepEqual(Object.keys(window2Snapshot.tabRecordsById), ['20']);
    assert.deepEqual(window1Response, {
      ok: false,
      error: 'superseded',
      windowId: 1,
    });
  },
);

test(
  'handleOrganiseTabs does not sort with another window state when reconciliation is superseded',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    const queryCallbacks = new Map();
    globalThis.chrome.tabs.query = query =>
      new Promise(resolve => { queryCallbacks.set(query.windowId, resolve); });
    const movedTabIds = [];
    globalThis.chrome.tabs.move = async (tabId) => {
      movedTabIds.push(tabId);
    };

    const sortWindow1 = handleOrganiseTabs({ windowId: 1 });
    await Promise.resolve();
    const reconcileWindow2 = reconcileWindowTabRecords(2, { force: true });
    await Promise.resolve();

    queryCallbacks.get(2)([
      createChromeTabFixture(20, { windowId: 2 }),
      createChromeTabFixture(21, { windowId: 2, index: 1 }),
    ]);
    await reconcileWindow2;
    queryCallbacks.get(1)([
      createChromeTabFixture(10, { windowId: 1 }),
      createChromeTabFixture(11, { windowId: 1, index: 1 }),
    ]);
    const result = await sortWindow1;

    assert.deepEqual(result, {
      ok: false,
      movedCount: 0,
      skippedReason: 'superseded',
    });
    assert.deepEqual(movedTabIds, []);
    assert.equal(getTrackedWindowId(), 2);
  },
);
