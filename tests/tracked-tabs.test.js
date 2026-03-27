import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../shared/constants.js';
import { backgroundStore } from '../background/store.js';
import { refreshTrackedTab, syncTrackedWindowTabs } from '../background/tracked-tabs.js';
import {
  ensureChromeApi,
  makeTrackedTabRecord,
  resetBackgroundStore,
} from './helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test(
  'refreshTrackedTab applies updates to the latest record object after async boundaries',
  { concurrency: false },
  async () => {
    resetBackgroundStore();
    const initialRecord = makeTrackedTabRecord(1, { pageRuntimeReady: false });
    backgroundStore.trackedTabsById = { 1: initialRecord };

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

    const refreshPromise = refreshTrackedTab(1);

    const replacementRecord = makeTrackedTabRecord(1, { pageRuntimeReady: false });
    backgroundStore.trackedTabsById = { 1: replacementRecord };

    await refreshPromise;

    assert.equal(backgroundStore.trackedTabsById[1], replacementRecord);
    assert.equal(replacementRecord.pageRuntimeReady, true);
    assert.equal(replacementRecord.videoDetails.lengthSeconds, 120);
    assert.equal(replacementRecord.videoDetails.remainingTime, 100);
    assert.equal(replacementRecord.isRemainingTimeStale, false);
  },
);

test(
  'syncTrackedWindowTabs does not mark already-open unsuspended tabs as recently unsuspended on initial rehydrate',
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

    await syncTrackedWindowTabs(1, { force: true });

    const record = backgroundStore.trackedTabsById[1];
    assert.equal(record.status, TAB_STATES.UNSUSPENDED);
    assert.equal(record.unsuspendedTimestamp, null);
  },
);

test(
  'syncTrackedWindowTabs keeps the recent unsuspend grace for real suspended-to-unsuspended transitions',
  { concurrency: false },
  async () => {
    resetBackgroundStore();
    backgroundStore.trackedTabsById = {
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

    await syncTrackedWindowTabs(1, { force: true });

    const record = backgroundStore.trackedTabsById[1];
    assert.equal(record.status, TAB_STATES.UNSUSPENDED);
    assert.equal(typeof record.unsuspendedTimestamp, 'number');
  },
);
