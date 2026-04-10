import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRetrySnapshotPoll } from '../../popup/controller.js';
import { LOADING_GRACE_MS, RECENTLY_UNSUSPENDED_MS, TAB_STATES } from '../../shared/constants.js';
import {
  shouldPollRecord,
  shouldPollSnapshot,
} from '../../popup/controller.js';

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

test('shouldPollRecord polls recently unsuspended stale tabs that need no user action yet', () => {
  const record = makeRecord({
    isRemainingTimeStale: true,
    pageRuntimeReady: false,
    unsuspendedTimestamp: Date.now() - (RECENTLY_UNSUSPENDED_MS - 1000),
  });

  assert.equal(shouldPollRecord(record), true);
});

test('shouldPollRecord does not poll stale tabs once they require a reload', () => {
  const record = makeRecord({
    isRemainingTimeStale: true,
    pageRuntimeReady: false,
    unsuspendedTimestamp: Date.now() - (RECENTLY_UNSUSPENDED_MS + 1000),
  });

  assert.equal(shouldPollRecord(record), false);
});

test('shouldPollRecord polls loading tabs during the loading grace window', () => {
  const record = makeRecord({
    status: TAB_STATES.LOADING,
    pageRuntimeReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS - 1000),
  });

  assert.equal(shouldPollRecord(record), true);
});

test('shouldPollSnapshot polls only when at least one tracked tab can self-resolve', () => {
  const snapshot = {
    tabRecordsById: {
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

  assert.equal(shouldPollSnapshot(snapshot), true);
  assert.equal(
    shouldPollSnapshot({ tabRecordsById: { 2: snapshot.tabRecordsById[2] } }),
    false,
  );
});

test('shouldRetrySnapshotPoll keeps polling after a failed snapshot load while popup is active', () => {
  assert.equal(shouldRetrySnapshotPoll(null, true), true);
  assert.equal(shouldRetrySnapshotPoll(undefined, true), true);
  assert.equal(shouldRetrySnapshotPoll({}, true), false);
  assert.equal(shouldRetrySnapshotPoll(null, false), false);
});
