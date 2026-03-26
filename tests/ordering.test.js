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
  backgroundState.watchTabsById = {};
  backgroundState.watchTabIdsByRemaining = [];
  backgroundState.watchTabIdsByIndex = [];
  backgroundState.isWindowSorted = false;
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
    isRemainingTimeStale: true,
    ...overrides,
  };
}

test('orders known remaining-time tabs before unknown tabs', () => {
  resetBackgroundState();
  backgroundState.watchTabsById = {
    1: makeRecord(1, { index: 0, videoDetails: { remainingTime: 50 }, isRemainingTimeStale: false }),
    2: makeRecord(2, { index: 1, videoDetails: { remainingTime: null }, isRemainingTimeStale: true }),
    3: makeRecord(3, { index: 2, videoDetails: { remainingTime: 10 }, isRemainingTimeStale: false }),
  };

  recomputeSorting();

  assert.deepEqual(backgroundState.watchTabIdsByRemaining, [3, 1, 2]);
  assert.deepEqual(backgroundState.watchTabIdsByIndex, [1, 2, 3]);
  assert.equal(backgroundState.isWindowSorted, false);
});

test('marks window as sorted only when all actionable tabs are known and ordered', () => {
  resetBackgroundState();
  backgroundState.watchTabsById = {
    1: makeRecord(1, { index: 0, videoDetails: { remainingTime: 5 }, isRemainingTimeStale: false }),
    2: makeRecord(2, { index: 1, videoDetails: { remainingTime: 20 }, isRemainingTimeStale: false }),
  };

  recomputeSorting();

  assert.equal(backgroundState.isWindowSorted, true);
  assert.equal(backgroundState.readinessMetrics.areAllTimesKnown, true);
  assert.equal(backgroundState.readinessMetrics.areAllSorted, true);
  assert.equal(backgroundState.readinessMetrics.areReadyTabsOutOfOrder, false);
});

test('derives readiness metrics for non-contiguous and out-of-order ready subsets', () => {
  resetBackgroundState();
  backgroundState.watchTabsById = {
    1: makeRecord(1, { index: 0, isRemainingTimeStale: true, isActiveTab: false, isHidden: true }),
    2: makeRecord(2, { index: 1, videoDetails: { remainingTime: 20 }, isRemainingTimeStale: false }),
    3: makeRecord(3, { index: 2, isRemainingTimeStale: true }),
    4: makeRecord(4, { index: 3, videoDetails: { remainingTime: 10 }, isRemainingTimeStale: false }),
  };

  recomputeSorting();

  assert.equal(backgroundState.readinessMetrics.readyTabCount, 2);
  assert.equal(backgroundState.readinessMetrics.areReadyTabsAtFront, false);
  assert.equal(backgroundState.readinessMetrics.areReadyTabsContiguous, false);
  assert.equal(backgroundState.readinessMetrics.areReadyTabsOutOfOrder, true);
  assert.equal(backgroundState.readinessMetrics.hasHiddenTabsWithStaleRemaining, true);
});

test('handles records without a finite index deterministically', () => {
  resetBackgroundState();
  backgroundState.watchTabsById = {
    1: makeRecord(1, { index: 0, videoDetails: { remainingTime: 8 }, isRemainingTimeStale: false }),
    2: makeRecord(2, { index: undefined, videoDetails: { remainingTime: 4 }, isRemainingTimeStale: false }),
    3: makeRecord(3, { index: undefined, videoDetails: { remainingTime: 2 }, isRemainingTimeStale: false }),
  };

  recomputeSorting();

  assert.deepEqual(backgroundState.watchTabIdsByIndex, [1, 2, 3]);
  assert.deepEqual(backgroundState.watchTabIdsByRemaining, [3, 2, 1]);
});

test('live tabs do not block sorted readiness for VOD tabs with known remaining times', () => {
  resetBackgroundState();
  backgroundState.watchTabsById = {
    1: makeRecord(1, { index: 0, videoDetails: { remainingTime: 5 }, isRemainingTimeStale: false }),
    2: makeRecord(2, { index: 1, videoDetails: { remainingTime: 15 }, isRemainingTimeStale: false }),
    3: makeRecord(3, {
      index: 2,
      isLiveStream: true,
      videoDetails: { remainingTime: null },
      isRemainingTimeStale: false,
    }),
  };

  recomputeSorting();

  assert.equal(backgroundState.isWindowSorted, true);
  assert.equal(backgroundState.readinessMetrics.trackedTabCount, 2);
  assert.equal(backgroundState.readinessMetrics.readyTabCount, 2);
  assert.equal(backgroundState.readinessMetrics.areAllTimesKnown, true);
  assert.equal(backgroundState.readinessMetrics.areAllSorted, true);
  assert.deepEqual(backgroundState.watchTabIdsByRemaining, [1, 2]);
});
