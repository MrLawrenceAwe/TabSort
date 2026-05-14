import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../../shared/tab-states.js';
import {
  LOADING_GRACE_MS,
  MEDIA_WAIT_GRACE_MS,
  RECENTLY_UNSUSPENDED_MS,
  RECENT_WATCH_TRANSITION_MS,
} from '../../shared/tab-user-actions.js';
import {
  shouldPollSnapshot,
  shouldRetrySnapshotPoll,
} from '../../popup/snapshot-poller.js';
import {
  shouldPollRecord,
  shouldRefreshRecordMetrics,
} from '../../shared/tab-refresh-policy.js';

const NOW_MS = 100_000;
const fakeNow = () => NOW_MS;

function makeRecord(overrides = {}) {
  return {
    id: 1,
    status: TAB_STATES.UNSUSPENDED,
    isLiveNow: false,
    isActiveTab: false,
    isHidden: false,
    contentScriptReady: true,
    videoElementReady: true,
    remainingTimeNeedsRefresh: false,
    unsuspendedTimestamp: null,
    loadingStartedAt: null,
    videoDetails: { remainingTime: null },
    ...overrides,
  };
}

test('shouldPollRecord polls recently unsuspended stale tabs that need no user action yet', () => {
  const record = makeRecord({
    remainingTimeNeedsRefresh: true,
    contentScriptReady: false,
    unsuspendedTimestamp: NOW_MS - (RECENTLY_UNSUSPENDED_MS - 1000),
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), true);
});

test('shouldPollRecord does not poll stale tabs once they require a reload', () => {
  const record = makeRecord({
    remainingTimeNeedsRefresh: true,
    contentScriptReady: false,
    unsuspendedTimestamp: NOW_MS - (RECENTLY_UNSUSPENDED_MS + 1000),
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), false);
});

test('shouldPollRecord polls loading tabs during the loading grace window', () => {
  const record = makeRecord({
    status: TAB_STATES.LOADING,
    contentScriptReady: false,
    loadingStartedAt: NOW_MS - (LOADING_GRACE_MS - 1000),
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), true);
});

test('shouldPollRecord polls active stale watch tabs while video data can self-resolve', () => {
  const record = makeRecord({
    isActiveTab: true,
    contentScriptReady: true,
    videoElementReady: false,
    remainingTimeNeedsRefresh: true,
    videoWaitStartedAt: NOW_MS - (MEDIA_WAIT_GRACE_MS - 1000),
    videoDetails: { remainingTime: 45143, lengthSeconds: 45143 },
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), true);
});

test('shouldPollRecord stops polling active stale watch tabs when media stays stuck', () => {
  const record = makeRecord({
    isActiveTab: true,
    contentScriptReady: true,
    videoElementReady: false,
    remainingTimeNeedsRefresh: true,
    videoWaitStartedAt: NOW_MS - (MEDIA_WAIT_GRACE_MS + 1000),
    videoDetails: { remainingTime: 45143, lengthSeconds: 45143 },
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), false);
});

test('shouldRefreshRecordMetrics still probes active stale tabs after polling grace expires', () => {
  const record = makeRecord({
    isActiveTab: true,
    contentScriptReady: false,
    videoElementReady: false,
    remainingTimeNeedsRefresh: true,
    transitionStartedAt: NOW_MS - (RECENT_WATCH_TRANSITION_MS + 1000),
    videoDetails: null,
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), false);
  assert.equal(shouldRefreshRecordMetrics(record, { now: fakeNow }), true);
});

test('shouldRefreshRecordMetrics does not probe hidden stale tabs after polling grace expires', () => {
  const record = makeRecord({
    isActiveTab: true,
    isHidden: true,
    contentScriptReady: false,
    videoElementReady: false,
    remainingTimeNeedsRefresh: true,
    transitionStartedAt: NOW_MS - (RECENT_WATCH_TRANSITION_MS + 1000),
    videoDetails: null,
  });

  assert.equal(shouldRefreshRecordMetrics(record, { now: fakeNow }), false);
});

test('shouldPollRecord polls recent watch URL transitions before asking for reload', () => {
  const record = makeRecord({
    isActiveTab: true,
    contentScriptReady: false,
    videoElementReady: false,
    remainingTimeNeedsRefresh: true,
    transitionStartedAt: NOW_MS - (RECENT_WATCH_TRANSITION_MS - 1000),
    videoDetails: null,
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), true);
});

test('shouldPollRecord stops polling stalled watch URL transitions', () => {
  const record = makeRecord({
    isActiveTab: true,
    contentScriptReady: false,
    videoElementReady: false,
    remainingTimeNeedsRefresh: true,
    transitionStartedAt: NOW_MS - (RECENT_WATCH_TRANSITION_MS + 1000),
    videoDetails: null,
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), false);
});

test('shouldPollSnapshot polls only when at least one tracked tab can self-resolve', () => {
  const snapshot = {
    tabRecordsById: {
      1: makeRecord({
        remainingTimeNeedsRefresh: true,
        contentScriptReady: false,
        unsuspendedTimestamp: NOW_MS - (RECENTLY_UNSUSPENDED_MS - 1000),
      }),
      2: makeRecord({
        remainingTimeNeedsRefresh: true,
        contentScriptReady: false,
        unsuspendedTimestamp: NOW_MS - (RECENTLY_UNSUSPENDED_MS + 1000),
      }),
    },
  };

  assert.equal(shouldPollSnapshot(snapshot, { now: fakeNow }), true);
  assert.equal(
    shouldPollSnapshot({ tabRecordsById: { 2: snapshot.tabRecordsById[2] } }, { now: fakeNow }),
    false,
  );
});

test('shouldRetrySnapshotPoll keeps polling after a failed snapshot load while popup is active', () => {
  assert.equal(shouldRetrySnapshotPoll(null, true), true);
  assert.equal(shouldRetrySnapshotPoll(undefined, true), true);
  assert.equal(shouldRetrySnapshotPoll({}, true), false);
  assert.equal(shouldRetrySnapshotPoll(null, false), false);
});
