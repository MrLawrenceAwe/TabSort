import assert from 'node:assert/strict';
import test from 'node:test';

import { LOADING_GRACE_MS, RECENTLY_UNSUSPENDED_MS, TAB_STATES } from '../shared/constants.js';
import { shouldAutoRefreshRecord, shouldAutoRefreshSnapshot } from '../popup/snapshot-refresh.js';

function makeRecord(overrides = {}) {
  return {
    id: 1,
    status: TAB_STATES.UNSUSPENDED,
    isLiveStream: false,
    isActiveTab: false,
    isHidden: false,
    pageRuntimeReady: true,
    isRemainingTimeStale: false,
    unsuspendedTimestamp: null,
    loadingStartedAt: null,
    videoDetails: { remainingTime: null },
    ...overrides,
  };
}

test('shouldAutoRefreshRecord polls recently unsuspended stale tabs that need no user action yet', () => {
  const record = makeRecord({
    isRemainingTimeStale: true,
    pageRuntimeReady: false,
    unsuspendedTimestamp: Date.now() - (RECENTLY_UNSUSPENDED_MS - 1000),
  });

  assert.equal(shouldAutoRefreshRecord(record), true);
});

test('shouldAutoRefreshRecord does not poll stale tabs once they require a reload', () => {
  const record = makeRecord({
    isRemainingTimeStale: true,
    pageRuntimeReady: false,
    unsuspendedTimestamp: Date.now() - (RECENTLY_UNSUSPENDED_MS + 1000),
  });

  assert.equal(shouldAutoRefreshRecord(record), false);
});

test('shouldAutoRefreshRecord polls loading tabs during the loading grace window', () => {
  const record = makeRecord({
    status: TAB_STATES.LOADING,
    pageRuntimeReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS - 1000),
  });

  assert.equal(shouldAutoRefreshRecord(record), true);
});

test('shouldAutoRefreshSnapshot polls only when at least one tracked tab can self-resolve', () => {
  const snapshot = {
    trackedTabsById: {
      1: makeRecord({
        isRemainingTimeStale: true,
        pageRuntimeReady: false,
        unsuspendedTimestamp: Date.now() - (RECENTLY_UNSUSPENDED_MS - 1000),
      }),
      2: makeRecord({
        isRemainingTimeStale: true,
        pageRuntimeReady: false,
        unsuspendedTimestamp: Date.now() - (RECENTLY_UNSUSPENDED_MS + 1000),
      }),
    },
  };

  assert.equal(shouldAutoRefreshSnapshot(snapshot), true);
  assert.equal(
    shouldAutoRefreshSnapshot({ trackedTabsById: { 2: snapshot.trackedTabsById[2] } }),
    false,
  );
});
