import assert from 'node:assert/strict';
import test from 'node:test';

import {
  syncFocusedWindow,
  syncInitialWindowState,
} from '../../background/windows/lifecycle.js';
import {
  canManageWindow,
  replaceAllTabRecords,
  trackedWindow,
} from '../../background/windows/store.js';
import {
  createChromeTabFixture,
  createTabRecordFixture,
  ensureChromeApi,
  resetTrackedWindowState,
  stubChromeTabQuery,
  stubChromeTabQueryFailure,
} from '../helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test(
  'syncFocusedWindow claims focused windows even before they have YouTube tabs',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    stubChromeTabQuery([]);

    await syncFocusedWindow(2);

    assert.equal(trackedWindow.windowId, 2);
    assert.equal(canManageWindow(2), true);
    assert.equal(canManageWindow(1), false);
  },
);

test(
  'syncFocusedWindow preserves coherent state when the new window query fails',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    replaceAllTabRecords({
      10: createTabRecordFixture(10, { windowId: 1 }),
    });
    stubChromeTabQueryFailure();

    await syncFocusedWindow(2);

    assert.equal(trackedWindow.windowId, 1);
    assert.deepEqual(Object.keys(trackedWindow.tabRecordsById), ['10']);
    assert.equal(trackedWindow.tabRecordsById[10].windowId, 1);
  },
);

test(
  'initial window sync cannot overwrite a newer focus sync',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    const queryCallbacks = new Map();
    let lastFocusedCallback;
    globalThis.chrome.windows = {
      getLastFocused(_options, callback) {
        lastFocusedCallback = callback;
      },
    };
    globalThis.chrome.tabs.query = (query, callback) => {
      queryCallbacks.set(query.windowId, callback);
    };

    const initialSync = syncInitialWindowState();
    lastFocusedCallback({ id: 1 });
    await Promise.resolve();

    const focusSync = syncFocusedWindow(2);
    queryCallbacks.get(2)([
      createChromeTabFixture(20, { windowId: 2 }),
    ]);
    await focusSync;

    queryCallbacks.get(1)([
      createChromeTabFixture(10, { windowId: 1 }),
    ]);
    await initialSync;

    assert.equal(trackedWindow.windowId, 2);
    assert.deepEqual(Object.keys(trackedWindow.tabRecordsById), ['20']);
  },
);
