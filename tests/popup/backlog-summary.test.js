import assert from 'node:assert/strict';
import test from 'node:test';
import { TAB_LOAD_STATES } from '../../shared/tabs/constants.js';

import {
  createBacklogSummary,
  formatBacklogDuration,
  formatBacklogSummary,
} from '../../popup/backlog-summary.js';

test('summarises only fresh finite remaining times', () => {
  const summary = createBacklogSummary([
    { loadState: TAB_LOAD_STATES.LOADED, videoDetails: { remainingSeconds: 3600 }, remainingSecondsStale: false },
    { loadState: TAB_LOAD_STATES.LOADED, videoDetails: { remainingSeconds: 65 }, remainingSecondsStale: false },
    { loadState: TAB_LOAD_STATES.LOADED, videoDetails: { remainingSeconds: 900 }, remainingSecondsStale: true },
    { loadState: TAB_LOAD_STATES.LOADED, videoDetails: null, remainingSecondsStale: false },
    { isLive: true, videoDetails: null, remainingSecondsStale: false },
  ]);

  assert.deepEqual(summary, {
    videoCount: 5,
    knownCount: 2,
    unknownCount: 2,
    liveCount: 1,
    totalRemainingSeconds: 3665,
  });
  assert.equal(formatBacklogSummary(summary), '5 videos · 1h 2m known remaining · 2 times unavailable · 1 live stream');
});

test('formats short and exact-hour backlog durations clearly', () => {
  assert.equal(formatBacklogDuration(0), '0m');
  assert.equal(formatBacklogDuration(1), '1m');
  assert.equal(formatBacklogDuration(59), '1m');
  assert.equal(formatBacklogDuration(7200), '2h');
});

test('reports unavailable time when no non-live video has reliable timing', () => {
  assert.equal(formatBacklogSummary(createBacklogSummary([
    { loadState: TAB_LOAD_STATES.LOADED, remainingSecondsStale: true, videoDetails: { remainingSeconds: 30 } },
  ])), '1 video · 1 time unavailable');
  assert.equal(formatBacklogSummary(createBacklogSummary([])), '');
});

test('keeps complete totals concise when every video has a known time', () => {
  assert.equal(formatBacklogSummary(createBacklogSummary([
    { loadState: TAB_LOAD_STATES.LOADED, remainingSecondsStale: false, videoDetails: { remainingSeconds: 120 } },
  ])), '1 video · 2m remaining');
});

test('counts only usable readings while preparation and loading are in progress', () => {
  const cases = [
    { loadState: TAB_LOAD_STATES.LOADED, autoPreparationInProgress: true, known: false },
    { loadState: TAB_LOAD_STATES.LOADING, known: false },
    { loadState: TAB_LOAD_STATES.DISCARDED, known: false },
    { loadState: TAB_LOAD_STATES.LOADING, hasAutoPreparedTime: true, known: true },
    { loadState: TAB_LOAD_STATES.DISCARDED, hasAutoPreparedTime: true, known: true },
    { loadState: TAB_LOAD_STATES.LOADED, remainingSeconds: 0, known: true },
    { loadState: TAB_LOAD_STATES.LOADED, remainingSeconds: -1, known: false },
    { loadState: TAB_LOAD_STATES.LOADED, remainingSeconds: NaN, known: false },
    { loadState: TAB_LOAD_STATES.LOADED, remainingSeconds: Infinity, known: false },
  ];
  for (const { known, remainingSeconds = 120, ...state } of cases) {
    const summary = createBacklogSummary([{
      remainingSecondsStale: false,
      ...state,
      videoDetails: { remainingSeconds },
    }]);
    assert.equal(summary.knownCount, Number(known), JSON.stringify(state));
    assert.equal(summary.unknownCount, Number(!known), JSON.stringify(state));
    assert.equal(summary.totalRemainingSeconds, known ? remainingSeconds : 0, JSON.stringify(state));
  }
});
