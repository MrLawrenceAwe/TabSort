import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBacklogSummary,
  formatBacklogDuration,
  formatBacklogSummary,
} from '../../popup/backlog-summary.js';

test('summarises only fresh finite remaining times', () => {
  const summary = createBacklogSummary([
    { videoDetails: { remainingSeconds: 3600 }, remainingSecondsStale: false },
    { videoDetails: { remainingSeconds: 65 }, remainingSecondsStale: false },
    { videoDetails: { remainingSeconds: 900 }, remainingSecondsStale: true },
    { videoDetails: null, remainingSecondsStale: false },
    { isLive: true, videoDetails: null, remainingSecondsStale: false },
  ]);

  assert.deepEqual(summary, {
    videoCount: 5,
    knownCount: 2,
    unknownCount: 2,
    liveCount: 1,
    totalRemainingSeconds: 3665,
  });
  assert.equal(formatBacklogSummary(summary), '5 videos · 1h 2m remaining · 2 unknown · 1 live stream');
});

test('formats short and exact-hour backlog durations clearly', () => {
  assert.equal(formatBacklogDuration(0), '0m');
  assert.equal(formatBacklogDuration(1), '1m');
  assert.equal(formatBacklogDuration(59), '1m');
  assert.equal(formatBacklogDuration(7200), '2h');
});

test('reports unavailable time when no non-live video has reliable timing', () => {
  assert.equal(formatBacklogSummary(createBacklogSummary([
    { remainingSecondsStale: true, videoDetails: { remainingSeconds: 30 } },
  ])), '1 video · remaining time unavailable · 1 unknown');
  assert.equal(formatBacklogSummary(createBacklogSummary([])), '');
});
