import { RECENTLY_LOADED_MS } from '../../shared/tabs/grace-periods.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_LOAD_STATES } from '../../shared/tabs/constants.js';
import {
  createSnapshotPoller,
  shouldPollSnapshot,
  shouldRetrySnapshotLoad,
} from '../../popup/snapshot-poller.js';

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

test('awake live tabs refresh their status; sleeping live tabs remain asleep', () => {
  const live = { isLive: true, loadState: TAB_LOAD_STATES.LOADED };
  assert.equal(shouldPollSnapshot({ tabRecordsById: { 1: live } }), true);
  const sleeping = { ...live, loadState: TAB_LOAD_STATES.DISCARDED };
  assert.equal(shouldPollSnapshot({ tabRecordsById: { 1: sleeping } }), false);
});

test('shouldPollSnapshot polls stale tabs during the load grace period and stops after it expires', () => {
  const snapshot = {
    tabRecordsById: {
      1: makeRecord({
        remainingSecondsStale: true,
        contentScriptReady: false,
        loadedAt: NOW_MS - (RECENTLY_LOADED_MS - 1000),
      }),
      2: makeRecord({
        remainingSecondsStale: true,
        contentScriptReady: false,
        loadedAt: NOW_MS - (RECENTLY_LOADED_MS + 1000),
      }),
    },
  };

  assert.equal(shouldPollSnapshot(snapshot, { now: fakeNow }), true);
  assert.equal(
    shouldPollSnapshot({ tabRecordsById: { 2: snapshot.tabRecordsById[2] } }, { now: fakeNow }),
    false,
  );
});

test('shouldPollSnapshot pauses while auto-preparation publishes its own updates', () => {
  const snapshot = {
    autoPreparation: { status: 'running' },
    tabRecordsById: {
      1: makeRecord({
        remainingSecondsStale: true,
        contentScriptReady: false,
        loadedAt: NOW_MS,
      }),
    },
  };

  assert.equal(shouldPollSnapshot(snapshot, { now: fakeNow }), false);
});

test('shouldRetrySnapshotLoad keeps polling after a failed snapshot load while popup is active', () => {
  assert.equal(shouldRetrySnapshotLoad(null, true), true);
  assert.equal(shouldRetrySnapshotLoad(undefined, true), true);
  assert.equal(shouldRetrySnapshotLoad({}, true), false);
  assert.equal(shouldRetrySnapshotLoad(null, false), false);
});

test('pausing during an in-flight poll prevents its response from restarting polling', async () => {
  let releaseLoad;
  let loadCount = 0;
  const loadingSnapshot = {
    tabRecordsById: {
      1: makeRecord({
        loadState: TAB_LOAD_STATES.LOADING,
        loadingStartedAt: NOW_MS,
      }),
    },
  };
  const poller = createSnapshotPoller({
    delayMs: 1,
    isPopupOpen: () => true,
    loadSnapshot: () => {
      loadCount += 1;
      return new Promise(resolve => { releaseLoad = resolve; });
    },
    logPopupError: () => {},
    onSnapshot: () => {},
  });

  poller.scheduleIfNeeded(null);
  await new Promise(resolve => setTimeout(resolve, 5));
  poller.setPaused(true);
  releaseLoad(loadingSnapshot);
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(loadCount, 1);
});

test('ready awake videos keep polling, including background playback; sleeping readings stay cached', () => {
  const ready = makeRecord({ videoDetails: { remainingSeconds: 90 } });
  assert.equal(shouldPollSnapshot({ tabRecordsById: { 1: ready } }), true);
  const sleeping = { ...ready, loadState: TAB_LOAD_STATES.DISCARDED, hasAutoPreparedTime: true };
  assert.equal(shouldPollSnapshot({ tabRecordsById: { 1: sleeping } }), false);
});
