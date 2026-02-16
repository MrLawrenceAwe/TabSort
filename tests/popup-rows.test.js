import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES, RECENTLY_UNSUSPENDED_MS } from '../shared/constants.js';
import { determineUserAction, formatVideoDetails } from '../popup/rows.js';

function makeRecord(overrides = {}) {
  return {
    id: 1,
    status: TAB_STATES.UNSUSPENDED,
    isLiveStream: false,
    isActiveTab: false,
    isHidden: false,
    contentScriptReady: true,
    remainingTimeMayBeStale: false,
    unsuspendedTimestamp: null,
    videoDetails: { remainingTime: null },
    ...overrides,
  };
}

test('stale rows without remaining time do not suggest viewing the tab', () => {
  const record = makeRecord({
    remainingTimeMayBeStale: true,
    contentScriptReady: false,
    unsuspendedTimestamp: Date.now() - (RECENTLY_UNSUSPENDED_MS + 1000),
  });

  assert.equal(determineUserAction(record), 'Reload tab');
  assert.equal(formatVideoDetails(record), 'unavailable');
});

test('recently unsuspended rows avoid contradictory stale guidance', () => {
  const record = makeRecord({
    remainingTimeMayBeStale: true,
    contentScriptReady: false,
    unsuspendedTimestamp: Date.now(),
  });

  assert.equal(determineUserAction(record), '');
  assert.equal(formatVideoDetails(record), 'unavailable');
});

test('stale rows with remaining time can still request view interaction when appropriate', () => {
  const record = makeRecord({
    remainingTimeMayBeStale: true,
    videoDetails: { remainingTime: 320 },
    contentScriptReady: true,
    isActiveTab: false,
  });

  assert.equal(determineUserAction(record), 'View tab to refresh time');
  assert.equal(formatVideoDetails(record), 'View tab to refresh time');
});
