import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../shared/constants.js';
import { refreshTabMetrics, sortTrackedTabsInWindow } from '../background/tracked-tabs.js';
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
  'refreshTabMetrics ignores stale responses after the tab URL changes',
  { concurrency: false },
  async () => {
    resetBackgroundState();
    backgroundState.trackedWindowId = 1;
    backgroundState.trackedVideoTabsById = {
      1: makeRecord({ url: 'https://www.youtube.com/watch?v=old' }),
    };

    globalThis.chrome.tabs.get = (_tabId, callback) => {
      setTimeout(() => {
        callback({
          id: 1,
          windowId: 1,
          url: 'https://www.youtube.com/watch?v=old',
          active: false,
          hidden: false,
        });
      }, 0);
    };

    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      setTimeout(() => {
        callback({
          title: 'Old video',
          url: 'https://www.youtube.com/watch?v=old',
          lengthSeconds: 120,
          currentTime: 20,
          playbackRate: 1,
          paused: false,
          isLive: false,
        });
      }, 10);
    };

    const refreshPromise = refreshTabMetrics(1);

    setTimeout(() => {
      backgroundState.trackedVideoTabsById = {
        1: makeRecord({
          url: 'https://www.youtube.com/watch?v=new',
          videoDetails: null,
          contentScriptReady: false,
          isRemainingTimeStale: true,
        }),
      };
    }, 1);

    await refreshPromise;

    const currentRecord = backgroundState.trackedVideoTabsById[1];
    assert.equal(currentRecord.url, 'https://www.youtube.com/watch?v=new');
    assert.equal(currentRecord.contentScriptReady, false);
    assert.equal(currentRecord.videoDetails, null);
    assert.equal(currentRecord.isRemainingTimeStale, true);
  },
);

test(
  'sortTrackedTabsInWindow can still regroup the window with a single ready video tab',
  { concurrency: false },
  async () => {
    resetBackgroundState();
    backgroundState.trackedWindowId = 1;
    backgroundState.trackedVideoTabsById = {
      1: makeRecord({ videoDetails: { remainingTime: 100, lengthSeconds: 120 }, isRemainingTimeStale: false }),
    };
    backgroundState.trackedVideoTabIdsByRemaining = [1];

    const moves = [];
    globalThis.chrome.tabs.query = (query, callback) => {
      if (query.hidden === true) {
        callback([]);
        return;
      }
      callback([
        { id: 1, index: 0, windowId: 1, pinned: false, url: 'https://www.youtube.com/watch?v=1' },
        { id: 2, index: 1, windowId: 1, pinned: false, url: 'https://example.com' },
        { id: 3, index: 2, windowId: 1, pinned: false, url: 'https://www.youtube.com/feed/subscriptions' },
      ]);
    };
    globalThis.chrome.tabs.move = async (tabId, info) => {
      moves.push({ tabId, index: info.index });
    };

    await sortTrackedTabsInWindow(1, { groupNonYoutubeTabsByDomain: false });

    assert.deepEqual(moves, [
      { tabId: 1, index: 0 },
      { tabId: 3, index: 1 },
      { tabId: 2, index: 2 },
    ]);
  },
);

test(
  'sortTrackedTabsInWindow honors explicit sort options instead of waiting for storage',
  { concurrency: false },
  async () => {
    resetBackgroundState();
    backgroundState.trackedWindowId = 1;
    backgroundState.trackedVideoTabIdsByRemaining = [1];
    backgroundState.trackedVideoTabsById = {
      1: makeRecord({ videoDetails: { remainingTime: 100, lengthSeconds: 120 }, isRemainingTimeStale: false }),
    };

    if (!globalThis.chrome.storage) {
      globalThis.chrome.storage = {};
    }
    globalThis.chrome.storage.sync = {
      get: (_defaults, callback) => {
        setTimeout(() => callback({ groupNonYoutubeTabsByDomain: false }), 10);
      },
    };

    const moves = [];
    globalThis.chrome.tabs.query = (query, callback) => {
      if (query.hidden === true) {
        callback([]);
        return;
      }
      callback([
        { id: 1, index: 0, windowId: 1, pinned: false, url: 'https://www.youtube.com/watch?v=1' },
        { id: 2, index: 1, windowId: 1, pinned: false, url: 'https://a.com/1' },
        { id: 3, index: 2, windowId: 1, pinned: false, url: 'https://b.com/1' },
        { id: 4, index: 3, windowId: 1, pinned: false, url: 'https://a.com/2' },
      ]);
    };
    globalThis.chrome.tabs.move = async (tabId, info) => {
      moves.push({ tabId, index: info.index });
    };

    await sortTrackedTabsInWindow(1, { groupNonYoutubeTabsByDomain: true });

    assert.deepEqual(moves, [
      { tabId: 1, index: 0 },
      { tabId: 2, index: 1 },
      { tabId: 4, index: 2 },
      { tabId: 3, index: 3 },
    ]);
  },
);
