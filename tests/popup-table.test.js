import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES, RECENTLY_UNSUSPENDED_MS, LOADING_GRACE_MS } from '../shared/constants.js';
import { determineUserAction, formatRemainingStatus } from '../popup/tab-row.js';

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
    videoDetails: { remainingTime: null },
    ...overrides,
  };
}

test('stale rows without remaining time do not suggest viewing the tab', () => {
  const record = makeRecord({
    isRemainingTimeStale: true,
    pageRuntimeReady: false,
    unsuspendedTimestamp: Date.now() - (RECENTLY_UNSUSPENDED_MS + 1000),
  });

  assert.equal(determineUserAction(record), 'Reload tab');
  assert.equal(formatRemainingStatus(record), 'unavailable');
});

test('recently unsuspended rows avoid contradictory stale guidance', () => {
  const record = makeRecord({
    isRemainingTimeStale: true,
    pageRuntimeReady: false,
    unsuspendedTimestamp: Date.now(),
  });

  assert.equal(determineUserAction(record), '');
  assert.equal(formatRemainingStatus(record), 'unavailable');
});

test('stale rows with remaining time can still request view interaction when appropriate', () => {
  const record = makeRecord({
    isRemainingTimeStale: true,
    videoDetails: { remainingTime: 320 },
    pageRuntimeReady: true,
    isActiveTab: false,
  });

  assert.equal(determineUserAction(record), 'View tab to refresh time');
  assert.equal(formatRemainingStatus(record), 'View tab to refresh time');
});

test('loading rows switch from waiting to interaction after the loading grace period', () => {
  const recentLoadingRecord = makeRecord({
    status: TAB_STATES.LOADING,
    pageRuntimeReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS - 1000),
  });

  const stalledLoadingRecord = makeRecord({
    status: TAB_STATES.LOADING,
    pageRuntimeReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS + 1000),
  });

  assert.equal(determineUserAction(recentLoadingRecord), 'Wait for tab to load');
  assert.equal(determineUserAction(stalledLoadingRecord), 'Interact with tab');
});
