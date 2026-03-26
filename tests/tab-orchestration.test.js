import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../shared/constants.js';
import { refreshMetricsForTab } from '../background/tab-orchestration.js';
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
  backgroundState.watchTabRecordsById = {};
  backgroundState.watchTabIdsByRemainingTime = [];
  backgroundState.watchTabIdsInCurrentOrder = [];
  backgroundState.tabsInCurrentWindowAreKnownToBeSorted = false;
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
    remainingTimeMayBeStale: true,
    ...overrides,
  };
}

test(
  'refreshMetricsForTab applies updates to the latest record object after async boundaries',
  { concurrency: false },
  async () => {
    resetBackgroundState();
    const initialRecord = makeRecord();
    backgroundState.watchTabRecordsById = { 1: initialRecord };

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

    const refreshPromise = refreshMetricsForTab(1);

    const replacementRecord = makeRecord();
    backgroundState.watchTabRecordsById = { 1: replacementRecord };

    await refreshPromise;

    assert.equal(backgroundState.watchTabRecordsById[1], replacementRecord);
    assert.equal(replacementRecord.contentScriptReady, true);
    assert.equal(replacementRecord.videoDetails.lengthSeconds, 120);
    assert.equal(replacementRecord.videoDetails.remainingTime, 100);
    assert.equal(replacementRecord.remainingTimeMayBeStale, false);
  },
);
