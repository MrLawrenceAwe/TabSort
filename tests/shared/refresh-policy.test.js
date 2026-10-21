import { RECENTLY_LOADED_MS, VIDEO_TRANSITION_GRACE_MS, MEDIA_WAIT_GRACE_MS, LOADING_GRACE_MS } from '../../shared/tabs/grace-periods.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_LOAD_STATES } from '../../shared/tabs/constants.js';
import {
  shouldPollRecord,
  shouldRefreshRecordMetrics,
} from '../../shared/tabs/refresh-policy.js';

const NOW_MS = 100_000;
const fakeNow = () => NOW_MS;

function makeRecord(overrides = {}) {
  return {
    id: 1,
    loadState: TAB_LOAD_STATES.LOADED,
    isLive: false,
    isActive: false,
    isHidden: false,
    contentScriptReady: true,
    playbackMetricsReady: true,
    remainingSecondsStale: false,
    loadedAt: null,
    loadingStartedAt: null,
    videoDetails: { remainingSeconds: null },
    ...overrides,
  };
}

test('shouldPollRecord polls recently loaded stale tabs that need no user action yet', () => {
  const record = makeRecord({
    remainingSecondsStale: true,
    contentScriptReady: false,
    loadedAt: NOW_MS - (RECENTLY_LOADED_MS - 1000),
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), true);
});

test('shouldPollRecord does not poll stale tabs once they require a reload', () => {
  const record = makeRecord({
    remainingSecondsStale: true,
    contentScriptReady: false,
    loadedAt: NOW_MS - (RECENTLY_LOADED_MS + 1000),
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), false);
});

test('shouldPollRecord polls loading tabs during the loading grace window', () => {
  const record = makeRecord({
    loadState: TAB_LOAD_STATES.LOADING,
    contentScriptReady: false,
    loadingStartedAt: NOW_MS - (LOADING_GRACE_MS - 1000),
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), true);
});

test('shouldPollRecord polls active stale watch tabs while video data can self-resolve', () => {
  const record = makeRecord({
    isActive: true,
    contentScriptReady: true,
    playbackMetricsReady: false,
    remainingSecondsStale: true,
    metricsWaitStartedAt: NOW_MS - (MEDIA_WAIT_GRACE_MS - 1000),
    videoDetails: { remainingSeconds: 45143, durationSeconds: 45143 },
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), true);
});

test('shouldPollRecord stops polling active stale watch tabs when media stays stuck', () => {
  const record = makeRecord({
    isActive: true,
    contentScriptReady: true,
    playbackMetricsReady: false,
    remainingSecondsStale: true,
    metricsWaitStartedAt: NOW_MS - (MEDIA_WAIT_GRACE_MS + 1000),
    videoDetails: { remainingSeconds: 45143, durationSeconds: 45143 },
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), false);
});

test('shouldRefreshRecordMetrics still probes active stale tabs after polling grace expires', () => {
  const record = makeRecord({
    isActive: true,
    contentScriptReady: false,
    playbackMetricsReady: false,
    remainingSecondsStale: true,
    transitionStartedAt: NOW_MS - (VIDEO_TRANSITION_GRACE_MS + 1000),
    videoDetails: null,
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), false);
  assert.equal(shouldRefreshRecordMetrics(record, { now: fakeNow }), true);
});

test('shouldRefreshRecordMetrics does not probe hidden stale tabs after polling grace expires', () => {
  const record = makeRecord({
    isActive: true,
    isHidden: true,
    contentScriptReady: false,
    playbackMetricsReady: false,
    remainingSecondsStale: true,
    transitionStartedAt: NOW_MS - (VIDEO_TRANSITION_GRACE_MS + 1000),
    videoDetails: null,
  });

  assert.equal(shouldRefreshRecordMetrics(record, { now: fakeNow }), false);
});

test('shouldPollRecord polls recent video URL transitions before asking for reload', () => {
  const record = makeRecord({
    isActive: true,
    contentScriptReady: false,
    playbackMetricsReady: false,
    remainingSecondsStale: true,
    transitionStartedAt: NOW_MS - (VIDEO_TRANSITION_GRACE_MS - 1000),
    videoDetails: null,
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), true);
});

test('shouldPollRecord stops polling stalled video URL transitions', () => {
  const record = makeRecord({
    isActive: true,
    contentScriptReady: false,
    playbackMetricsReady: false,
    remainingSecondsStale: true,
    transitionStartedAt: NOW_MS - (VIDEO_TRANSITION_GRACE_MS + 1000),
    videoDetails: null,
  });

  assert.equal(shouldPollRecord(record, { now: fakeNow }), false);
});

test('awake live tabs refresh their status; sleeping live tabs remain asleep', () => {
  const live = { isLive: true, loadState: TAB_LOAD_STATES.LOADED };
  assert.equal(shouldRefreshRecordMetrics(live), true);
  const sleeping = { ...live, loadState: TAB_LOAD_STATES.DISCARDED };
  assert.equal(shouldPollRecord(sleeping), false);
  assert.equal(shouldRefreshRecordMetrics(sleeping), false);
});

test('ready awake videos keep polling, including background playback; sleeping readings stay cached', () => {
  const ready = makeRecord({ videoDetails: { remainingSeconds: 90 } });
  assert.equal(shouldRefreshRecordMetrics(ready), true);
  const sleeping = { ...ready, loadState: TAB_LOAD_STATES.DISCARDED, hasAutoPreparedTime: true };
  assert.equal(shouldRefreshRecordMetrics(sleeping), false);
});
