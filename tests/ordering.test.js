import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../shared/constants.js';
import { recomputeSorting } from '../background/ordering.js';
import { backgroundState } from '../background/state.js';

if (!globalThis.chrome) {
  globalThis.chrome = {};
}
if (!globalThis.chrome.runtime) {
  globalThis.chrome.runtime = {};
}
globalThis.chrome.runtime.lastError = null;
globalThis.chrome.runtime.sendMessage = (_message, callback) => {
  if (typeof callback === 'function') callback();
};

function resetBackgroundState() {
  backgroundState.youtubeWatchTabRecordsOfCurrentWindow = {};
  backgroundState.youtubeWatchTabRecordIdsSortedByRemainingTime = [];
  backgroundState.youtubeWatchTabRecordIdsInCurrentOrder = [];
  backgroundState.tabsInCurrentWindowAreKnownToBeSorted = false;
  backgroundState.readinessMetrics = null;
  backgroundState.trackedWindowId = null;
  backgroundState.lastBroadcastSignature = null;
}

function makeRecord(id, overrides = {}) {
  return {
    id,
    windowId: 1,
    url: `https://www.youtube.com/watch?v=${id}`,
    index: 0,
    pinned: false,
    status: TAB_STATES.UNSUSPENDED,
    contentScriptReady: true,
    metadataLoaded: true,
    isLiveStream: false,
    isActiveTab: false,
    isHidden: false,
    videoDetails: { remainingTime: null },
    unsuspendedTimestamp: null,
    remainingTimeMayBeStale: true,
    ...overrides,
  };
}

test('orders known remaining-time tabs before unknown tabs', () => {
  resetBackgroundState();
  backgroundState.youtubeWatchTabRecordsOfCurrentWindow = {
    1: makeRecord(1, { index: 0, videoDetails: { remainingTime: 50 }, remainingTimeMayBeStale: false }),
    2: makeRecord(2, { index: 1, videoDetails: { remainingTime: null }, remainingTimeMayBeStale: true }),
    3: makeRecord(3, { index: 2, videoDetails: { remainingTime: 10 }, remainingTimeMayBeStale: false }),
  };

  recomputeSorting();

  assert.deepEqual(backgroundState.youtubeWatchTabRecordIdsSortedByRemainingTime, [3, 1, 2]);
  assert.deepEqual(backgroundState.youtubeWatchTabRecordIdsInCurrentOrder, [1, 2, 3]);
  assert.equal(backgroundState.tabsInCurrentWindowAreKnownToBeSorted, false);
});

test('marks window as sorted only when all actionable tabs are known and ordered', () => {
  resetBackgroundState();
  backgroundState.youtubeWatchTabRecordsOfCurrentWindow = {
    1: makeRecord(1, { index: 0, videoDetails: { remainingTime: 5 }, remainingTimeMayBeStale: false }),
    2: makeRecord(2, { index: 1, videoDetails: { remainingTime: 20 }, remainingTimeMayBeStale: false }),
  };

  recomputeSorting();

  assert.equal(backgroundState.tabsInCurrentWindowAreKnownToBeSorted, true);
  assert.equal(backgroundState.readinessMetrics.allKnown, true);
  assert.equal(backgroundState.readinessMetrics.computedAllSorted, true);
  assert.equal(backgroundState.readinessMetrics.knownWatchTabsOutOfOrder, false);
});

test('derives readiness metrics for non-contiguous and out-of-order ready subsets', () => {
  resetBackgroundState();
  backgroundState.youtubeWatchTabRecordsOfCurrentWindow = {
    1: makeRecord(1, { index: 0, remainingTimeMayBeStale: true, isActiveTab: false, isHidden: true }),
    2: makeRecord(2, { index: 1, videoDetails: { remainingTime: 20 }, remainingTimeMayBeStale: false }),
    3: makeRecord(3, { index: 2, remainingTimeMayBeStale: true }),
    4: makeRecord(4, { index: 3, videoDetails: { remainingTime: 10 }, remainingTimeMayBeStale: false }),
  };

  recomputeSorting();

  assert.equal(backgroundState.readinessMetrics.watchTabsReadyCount, 2);
  assert.equal(backgroundState.readinessMetrics.readyTabsAreAtFront, false);
  assert.equal(backgroundState.readinessMetrics.readyTabsAreContiguous, false);
  assert.equal(backgroundState.readinessMetrics.knownWatchTabsOutOfOrder, true);
  assert.equal(backgroundState.readinessMetrics.hiddenTabsMayHaveStaleRemaining, true);
});

test('handles records without a finite index deterministically', () => {
  resetBackgroundState();
  backgroundState.youtubeWatchTabRecordsOfCurrentWindow = {
    1: makeRecord(1, { index: 0, videoDetails: { remainingTime: 8 }, remainingTimeMayBeStale: false }),
    2: makeRecord(2, { index: undefined, videoDetails: { remainingTime: 4 }, remainingTimeMayBeStale: false }),
    3: makeRecord(3, { index: undefined, videoDetails: { remainingTime: 2 }, remainingTimeMayBeStale: false }),
  };

  recomputeSorting();

  assert.deepEqual(backgroundState.youtubeWatchTabRecordIdsInCurrentOrder, [1, 2, 3]);
  assert.deepEqual(backgroundState.youtubeWatchTabRecordIdsSortedByRemainingTime, [3, 2, 1]);
});
