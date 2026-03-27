import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../shared/constants.js';
import { backgroundState } from '../background/state.js';
import { handleTabDetailsHint } from '../background/handlers/content-script.js';

if (!globalThis.chrome) {
  globalThis.chrome = {};
}
if (!globalThis.chrome.runtime) {
  globalThis.chrome.runtime = {};
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
  backgroundState.trackedWindowId = 1;
  backgroundState.lastBroadcastSignature = null;
}

function makeRecord(id, overrides = {}) {
  return {
    id,
    windowId: 1,
    url: `https://www.youtube.com/watch?v=${id}`,
    index: 0,
    pinned: false,
    status: TAB_STATES.UNSUSPENDED,
    contentScriptReady: true,
    metadataLoaded: true,
    isLiveStream: false,
    isActiveTab: false,
    isHidden: false,
    videoDetails: { title: `Video ${id}`, remainingTime: 25, lengthSeconds: 100 },
    unsuspendedTimestamp: null,
    isRemainingTimeStale: false,
    ...overrides,
  };
}

test('handleTabDetailsHint does not create records for non-watch YouTube pages', async () => {
  resetBackgroundState();

  await handleTabDetailsHint(
    {
      details: {
        url: 'https://www.youtube.com/',
        title: 'YouTube Home',
      },
    },
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/',
      },
    },
  );

  assert.equal(backgroundState.trackedVideoTabsById[7], undefined);
  assert.deepEqual(backgroundState.trackedVideoTabIdsByIndex, []);
  assert.deepEqual(backgroundState.trackedVideoTabIdsByRemaining, []);
});

test('handleTabDetailsHint removes tracked rows when tab leaves watch/shorts', async () => {
  resetBackgroundState();
  backgroundState.trackedVideoTabsById = {
    7: makeRecord(7),
  };
  backgroundState.trackedVideoTabIdsByIndex = [7];
  backgroundState.trackedVideoTabIdsByRemaining = [7];

  await handleTabDetailsHint(
    {
      details: {
        url: 'https://www.youtube.com/results?search_query=music',
        title: 'Search results',
      },
    },
    {
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/results?search_query=music',
      },
    },
  );

  assert.equal(backgroundState.trackedVideoTabsById[7], undefined);
  assert.deepEqual(backgroundState.trackedVideoTabIdsByIndex, []);
  assert.deepEqual(backgroundState.trackedVideoTabIdsByRemaining, []);
});

