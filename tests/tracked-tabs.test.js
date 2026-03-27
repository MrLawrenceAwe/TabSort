import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../shared/constants.js';
import { backgroundStore } from '../background/background-store.js';
import { refreshTabMetrics, syncTrackedTabs } from '../background/tab-sync.js';
import {
  ensureChromeApi,
  makeTrackedTabRecord,
  resetBackgroundStore,
} from './helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test(
  'refreshTabMetrics applies updates to the latest record object after async boundaries',
  { concurrency: false },
  async () => {
    resetBackgroundStore();
    const initialRecord = makeTrackedTabRecord(1, { pageRuntimeReady: false });
    backgroundStore.trackedVideoTabsById = { 1: initialRecord };

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

    const replacementRecord = makeTrackedTabRecord(1, { pageRuntimeReady: false });
    backgroundStore.trackedVideoTabsById = { 1: replacementRecord };

    await refreshPromise;

    assert.equal(backgroundStore.trackedVideoTabsById[1], replacementRecord);
    assert.equal(replacementRecord.pageRuntimeReady, true);
    assert.equal(replacementRecord.videoDetails.lengthSeconds, 120);
    assert.equal(replacementRecord.videoDetails.remainingTime, 100);
    assert.equal(replacementRecord.isRemainingTimeStale, false);
  },
);

test(
  'syncTrackedTabs does not mark already-open unsuspended tabs as recently unsuspended on initial rehydrate',
  { concurrency: false },
  async () => {
    resetBackgroundStore();

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

    const record = backgroundStore.trackedVideoTabsById[1];
    assert.equal(record.status, TAB_STATES.UNSUSPENDED);
    assert.equal(record.unsuspendedTimestamp, null);
  },
);

test(
  'syncTrackedTabs keeps the recent unsuspend grace for real suspended-to-unsuspended transitions',
  { concurrency: false },
  async () => {
    resetBackgroundStore();
    backgroundStore.trackedVideoTabsById = {
      1: makeTrackedTabRecord(1, {
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

    const record = backgroundStore.trackedVideoTabsById[1];
    assert.equal(record.status, TAB_STATES.UNSUSPENDED);
    assert.equal(typeof record.unsuspendedTimestamp, 'number');
  },
);
