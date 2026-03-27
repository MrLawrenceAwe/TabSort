import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../shared/constants.js';
import { refreshTabMetrics, syncTrackedTabs } from '../background/tracked-tabs.js';
import { backgroundState } from '../background/state.js';

if (!globalThis.chrome) {
  globalThis.chrome = {};
}
if (!globalThis.chrome.runtime) {
  globalThis.chrome.runtime = {};
}
if (!globalThis.chrome.tabs) {
  globalThis.chrome.tabs = {};
}

globalThis.chrome.runtime.lastError = null;
globalThis.chrome.runtime.sendMessage = (_message, callback) => {
  if (typeof callback === 'function') callback();
};

function resetBackgroundState() {
  backgroundState.trackedVideoTabsById = {};
  backgroundState.trackedVideoTabIdsByRemaining = [];
  backgroundState.trackedVideoTabIdsByIndex = [];
  backgroundState.areTrackedTabsSorted = false;
  backgroundState.readinessMetrics = null;
  backgroundState.trackedWindowId = null;
  backgroundState.lastBroadcastSignature = null;
}

function makeRecord(overrides = {}) {
  return {
    id: 1,
    windowId: 1,
    url: 'https://www.youtube.com/watch?v=1',
    index: 0,
    pinned: false,
    status: TAB_STATES.UNSUSPENDED,
    contentScriptReady: false,
    metadataLoaded: false,
    isLiveStream: false,
    isActiveTab: false,
    isHidden: false,
    videoDetails: { remainingTime: null, lengthSeconds: null },
    unsuspendedTimestamp: null,
    isRemainingTimeStale: true,
    ...overrides,
  };
}

test(
  'refreshTabMetrics applies updates to the latest record object after async boundaries',
  { concurrency: false },
  async () => {
    resetBackgroundState();
    const initialRecord = makeRecord();
    backgroundState.trackedVideoTabsById = { 1: initialRecord };

    globalThis.chrome.tabs.get = (_tabId, callback) => {
      setTimeout(() => {
        callback({
          id: 1,
          windowId: 1,
          url: 'https://www.youtube.com/watch?v=1',
          active: false,
          hidden: false,
        });
      }, 0);
    };

    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      setTimeout(() => {
        callback({
          title: 'Video 1',
          url: 'https://www.youtube.com/watch?v=1',
          lengthSeconds: 120,
          currentTime: 20,
          playbackRate: 1,
          paused: false,
          isLive: false,
        });
      }, 0);
    };

    const refreshPromise = refreshTabMetrics(1);

    const replacementRecord = makeRecord();
    backgroundState.trackedVideoTabsById = { 1: replacementRecord };

    await refreshPromise;

    assert.equal(backgroundState.trackedVideoTabsById[1], replacementRecord);
    assert.equal(replacementRecord.contentScriptReady, true);
    assert.equal(replacementRecord.videoDetails.lengthSeconds, 120);
    assert.equal(replacementRecord.videoDetails.remainingTime, 100);
    assert.equal(replacementRecord.isRemainingTimeStale, false);
  },
);

test(
  'syncTrackedTabs does not mark already-open unsuspended tabs as recently unsuspended on initial rehydrate',
  { concurrency: false },
  async () => {
    resetBackgroundState();

    globalThis.chrome.tabs.query = (_query, callback) => {
      callback([
        {
          id: 1,
          windowId: 1,
          url: 'https://www.youtube.com/watch?v=1',
          index: 0,
          pinned: false,
          status: 'complete',
          active: false,
          hidden: false,
          discarded: false,
        },
      ]);
    };

    await syncTrackedTabs(1, { force: true });

    const record = backgroundState.trackedVideoTabsById[1];
    assert.equal(record.status, TAB_STATES.UNSUSPENDED);
    assert.equal(record.unsuspendedTimestamp, null);
  },
);

test(
  'syncTrackedTabs keeps the recent unsuspend grace for real suspended-to-unsuspended transitions',
  { concurrency: false },
  async () => {
    resetBackgroundState();
    backgroundState.trackedVideoTabsById = {
      1: makeRecord({
        status: TAB_STATES.SUSPENDED,
        unsuspendedTimestamp: null,
      }),
    };

    globalThis.chrome.tabs.query = (_query, callback) => {
      callback([
        {
          id: 1,
          windowId: 1,
          url: 'https://www.youtube.com/watch?v=1',
          index: 0,
          pinned: false,
          status: 'complete',
          active: false,
          hidden: false,
          discarded: false,
        },
      ]);
    };

    await syncTrackedTabs(1, { force: true });

    const record = backgroundState.trackedVideoTabsById[1];
    assert.equal(record.status, TAB_STATES.UNSUSPENDED);
    assert.equal(typeof record.unsuspendedTimestamp, 'number');
  },
);
