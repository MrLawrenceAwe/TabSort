import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../shared/constants.js';
import { reloadTab } from '../background/handlers/tab-actions.js';
import { backgroundState } from '../background/state.js';

if (!globalThis.chrome) {
  globalThis.chrome = {};
}
if (!globalThis.chrome.runtime) {
  globalThis.chrome.runtime = {};
}
if (!globalThis.chrome.tabs) {
  globalThis.chrome.tabs = {};
}

globalThis.chrome.runtime.lastError = null;
globalThis.chrome.runtime.sendMessage = (_message, callback) => {
  if (typeof callback === 'function') callback();
};

function makeRecord(overrides = {}) {
  return {
    id: 1,
    windowId: 1,
    url: 'https://www.youtube.com/watch?v=1',
    index: 0,
    pinned: false,
    status: TAB_STATES.UNSUSPENDED,
    contentScriptReady: true,
    metadataLoaded: true,
    isLiveStream: false,
    isActiveTab: false,
    isHidden: false,
    videoDetails: { remainingTime: 100 },
    unsuspendedTimestamp: null,
    remainingTimeMayBeStale: false,
    ...overrides,
  };
}

function resetBackgroundState() {
  backgroundState.watchTabRecordsById = {};
  backgroundState.watchTabIdsByRemainingTime = [];
  backgroundState.watchTabIdsInCurrentOrder = [];
  backgroundState.tabsInCurrentWindowAreKnownToBeSorted = false;
  backgroundState.readinessMetrics = null;
  backgroundState.trackedWindowId = null;
  backgroundState.lastBroadcastSignature = null;
}

test('reloadTab does not mutate record state when chrome.tabs.reload fails', { concurrency: false }, async () => {
  resetBackgroundState();
  backgroundState.watchTabRecordsById = {
    1: makeRecord(),
  };
  const before = JSON.parse(JSON.stringify(backgroundState.watchTabRecordsById[1]));

  globalThis.chrome.tabs.reload = async () => {
    throw new Error('reload failed');
  };

  await reloadTab({ tabId: 1, windowId: 1 });

  assert.deepEqual(backgroundState.watchTabRecordsById[1], before);
});

test('reloadTab marks record loading only after successful reload call', { concurrency: false }, async () => {
  resetBackgroundState();
  backgroundState.watchTabRecordsById = {
    1: makeRecord(),
  };

  globalThis.chrome.tabs.reload = async () => {};

  await reloadTab({ tabId: 1, windowId: 1 });

  const record = backgroundState.watchTabRecordsById[1];
  assert.equal(record.status, TAB_STATES.LOADING);
  assert.equal(record.contentScriptReady, false);
  assert.equal(record.metadataLoaded, false);
  assert.equal(record.remainingTimeMayBeStale, true);
  assert.equal(record.videoDetails.remainingTime, null);
  assert.equal(typeof record.unsuspendedTimestamp, 'number');
});
