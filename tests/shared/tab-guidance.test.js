import { RECENTLY_LOADED_MS, RECENT_WATCH_TRANSITION_MS, MEDIA_WAIT_GRACE_MS, LOADING_GRACE_MS } from '../../shared/tabs/grace-periods.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_LOAD_STATES } from '../../shared/tabs/constants.js';
import {
  determineTabGuidance,
  TAB_GUIDANCE,
} from '../../shared/tabs/guidance.js';

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
    videoDetails: { remainingSeconds: null },
    ...overrides,
  };
}

test('stale rows without remaining time do not suggest viewing the tab', () => {
  const record = makeRecord({
    remainingSecondsStale: true,
    contentScriptReady: false,
    loadedAt: Date.now() - (RECENTLY_LOADED_MS + 1000),
  });

  assert.equal(determineTabGuidance(record), TAB_GUIDANCE.RELOAD_TAB);
});

test('recently loaded rows avoid contradictory stale guidance', () => {
  const record = makeRecord({
    remainingSecondsStale: true,
    contentScriptReady: false,
    loadedAt: Date.now(),
  });

  assert.equal(determineTabGuidance(record), TAB_GUIDANCE.NONE);
});

test('recent watch URL transitions avoid reload guidance while runtime can catch up', () => {
  const activeRecord = makeRecord({
    isActive: true,
    remainingSecondsStale: true,
    contentScriptReady: false,
    playbackMetricsReady: false,
    transitionStartedAt: Date.now(),
    videoDetails: null,
  });
  const inactiveRecord = makeRecord({
    isActive: false,
    remainingSecondsStale: true,
    contentScriptReady: false,
    playbackMetricsReady: false,
    transitionStartedAt: Date.now(),
    videoDetails: null,
  });

  assert.equal(determineTabGuidance(activeRecord), TAB_GUIDANCE.NONE);
  assert.equal(determineTabGuidance(inactiveRecord), TAB_GUIDANCE.NONE);
});

test('stalled watch URL transitions eventually ask for the useful action', () => {
  const activeRecord = makeRecord({
    isActive: true,
    remainingSecondsStale: true,
    contentScriptReady: false,
    playbackMetricsReady: false,
    transitionStartedAt: Date.now() - (RECENT_WATCH_TRANSITION_MS + 1000),
    videoDetails: null,
  });
  const inactiveRecord = makeRecord({
    isActive: false,
    remainingSecondsStale: true,
    contentScriptReady: false,
    playbackMetricsReady: false,
    transitionStartedAt: Date.now() - (RECENT_WATCH_TRANSITION_MS + 1000),
    videoDetails: null,
  });

  assert.equal(determineTabGuidance(activeRecord), TAB_GUIDANCE.RELOAD_TAB);
  assert.equal(determineTabGuidance(inactiveRecord), TAB_GUIDANCE.RELOAD_TAB);
});

test('stale rows with remaining time can still request viewing the tab when appropriate', () => {
  const record = makeRecord({
    remainingSecondsStale: true,
    videoDetails: { remainingSeconds: 320 },
    contentScriptReady: true,
    isActive: false,
  });

  assert.equal(determineTabGuidance(record), TAB_GUIDANCE.VIEW_TAB_TO_REFRESH_TIME);
});

test('loading rows switch from waiting to view after the loading grace period', () => {
  const recentLoadingRecord = makeRecord({
    loadState: TAB_LOAD_STATES.LOADING,
    contentScriptReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS - 1000),
  });

  const stalledLoadingRecord = makeRecord({
    loadState: TAB_LOAD_STATES.LOADING,
    contentScriptReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS + 1000),
  });

  assert.equal(determineTabGuidance(recentLoadingRecord), TAB_GUIDANCE.WAIT_FOR_LOAD);
  assert.equal(determineTabGuidance(stalledLoadingRecord), TAB_GUIDANCE.ACTIVATE_TAB);
});

test('active loading rows switch from waiting to reload after the loading grace period', () => {
  const activeStalledLoadingRecord = makeRecord({
    loadState: TAB_LOAD_STATES.LOADING,
    isActive: true,
    contentScriptReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS + 1000),
  });

  assert.equal(determineTabGuidance(activeStalledLoadingRecord), TAB_GUIDANCE.RELOAD_TAB);
});

test('active watch rows wait through video data mismatches instead of asking for reload', () => {
  const activeAdRecord = makeRecord({
    isActive: true,
    contentScriptReady: true,
    playbackMetricsReady: false,
    remainingSecondsStale: true,
    metricsWaitStartedAt: Date.now() - (MEDIA_WAIT_GRACE_MS - 1000),
    videoDetails: { remainingSeconds: 45143, durationSeconds: 45143 },
  });

  assert.equal(determineTabGuidance(activeAdRecord), TAB_GUIDANCE.WAIT_FOR_VIDEO_DATA);
});

test('active watch rows eventually ask for reload when video data stays stuck', () => {
  const activeStalledMediaRecord = makeRecord({
    isActive: true,
    contentScriptReady: true,
    playbackMetricsReady: false,
    remainingSecondsStale: true,
    metricsWaitStartedAt: Date.now() - (MEDIA_WAIT_GRACE_MS + 1000),
    videoDetails: { remainingSeconds: 45143, durationSeconds: 45143 },
  });

  assert.equal(determineTabGuidance(activeStalledMediaRecord), TAB_GUIDANCE.RELOAD_TAB);
});

test('background loaded rows ask the user to view before reloading for missing time', () => {
  const record = makeRecord({
    isActive: false,
    contentScriptReady: true,
    videoDetails: { remainingSeconds: null },
  });

  assert.equal(determineTabGuidance(record), TAB_GUIDANCE.VIEW_TAB_TO_LOAD_TIME);
});
