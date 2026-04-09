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
          pageMediaReady: true,
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

test(
  'syncTrackedWindowTabs resets runtime readiness when a tracked tab navigates to a new video URL',
  { concurrency: false },
  async () => {
    resetBackgroundStore();
    backgroundStore.trackedTabsById = {
      1: makeTrackedTabRecord(1, {
        url: 'https://www.youtube.com/watch?v=old',
        pageMediaReady: true,
        pageRuntimeReady: true,
        videoDetails: { title: 'Old Video', remainingTime: 45, lengthSeconds: 120 },
        isRemainingTimeStale: false,
      }),
    };

    globalThis.chrome.tabs.query = (_query, callback) => {
      callback([
        {
          id: 1,
          windowId: 1,
          url: 'https://www.youtube.com/watch?v=new',
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
    assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
    assert.equal(record.pageRuntimeReady, false);
    assert.equal(record.pageMediaReady, false);
    assert.equal(record.videoDetails, null);
    assert.equal(record.isLiveStream, false);
    assert.equal(record.isRemainingTimeStale, true);
  },
);

test(
  'refreshTrackedTab updates the stored URL when collected metrics come from a new watch page',
  { concurrency: false },
  async () => {
    resetBackgroundStore();
    backgroundStore.trackedTabsById = {
      1: makeTrackedTabRecord(1, {
        url: 'https://www.youtube.com/watch?v=old',
        videoDetails: { title: 'Old Video', remainingTime: 45, lengthSeconds: 120 },
        isRemainingTimeStale: false,
        pageRuntimeReady: false,
      }),
    };

    globalThis.chrome.tabs.get = (_tabId, callback) => {
      callback({
        id: 1,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=new',
        active: false,
        hidden: false,
      });
    };

    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      callback({
        title: 'New Video',
        url: 'https://www.youtube.com/watch?v=new',
        pageMediaReady: true,
        lengthSeconds: 400,
        currentTime: 10,
        playbackRate: 1,
        paused: false,
        isLive: false,
      });
    };

    await refreshTrackedTab(1);

    const record = backgroundStore.trackedTabsById[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
    assert.equal(record.videoDetails.title, 'New Video');
    assert.equal(record.videoDetails.lengthSeconds, 400);
    assert.equal(record.videoDetails.remainingTime, 390);
    assert.equal(record.isRemainingTimeStale, false);
  },
);

test(
  'refreshTrackedTab ignores async metric payloads that no longer match the tracked URL',
  { concurrency: false },
  async () => {
    resetBackgroundStore();
    backgroundStore.trackedTabsById = {
      1: makeTrackedTabRecord(1, {
        url: 'https://www.youtube.com/watch?v=old',
        pageRuntimeReady: false,
        pageMediaReady: false,
        videoDetails: null,
      }),
    };

    let getCallCount = 0;
    globalThis.chrome.tabs.get = (_tabId, callback) => {
      getCallCount += 1;
      setTimeout(() => {
        callback({
          id: 1,
          windowId: 1,
          url:
            getCallCount === 1
              ? 'https://www.youtube.com/watch?v=old'
              : 'https://www.youtube.com/watch?v=new',
          active: false,
          hidden: false,
        });
      }, 0);
    };

    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      setTimeout(() => {
        callback({
          title: 'Old Video',
          url: 'https://www.youtube.com/watch?v=old',
          pageMediaReady: true,
          lengthSeconds: 120,
          currentTime: 20,
          playbackRate: 1,
          paused: false,
          isLive: false,
        });
      }, 0);
    };

    const refreshPromise = refreshTrackedTab(1);

    backgroundStore.trackedTabsById[1] = makeTrackedTabRecord(1, {
      url: 'https://www.youtube.com/watch?v=new',
      pageRuntimeReady: false,
      pageMediaReady: false,
      videoDetails: null,
      isRemainingTimeStale: true,
    });

    await refreshPromise;

    const record = backgroundStore.trackedTabsById[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
    assert.equal(record.videoDetails, null);
    assert.equal(record.pageRuntimeReady, false);
    assert.equal(record.pageMediaReady, false);
    assert.equal(record.isRemainingTimeStale, true);
  },
);

test(
  'refreshTrackedTab keeps remaining time stale until the current page reports media ready',
  { concurrency: false },
  async () => {
    resetBackgroundStore();
    backgroundStore.trackedTabsById = {
      1: makeTrackedTabRecord(1, {
        url: 'https://www.youtube.com/watch?v=new',
        pageRuntimeReady: true,
        pageMediaReady: false,
        videoDetails: { title: 'New Video', remainingTime: null, lengthSeconds: null },
        isRemainingTimeStale: true,
      }),
    };

    globalThis.chrome.tabs.get = (_tabId, callback) => {
      callback({
        id: 1,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=new',
        active: false,
        hidden: false,
      });
    };

    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      callback({
        title: 'New Video',
        url: 'https://www.youtube.com/watch?v=new',
        pageMediaReady: false,
        lengthSeconds: 400,
        currentTime: 10,
        playbackRate: 1,
        paused: false,
        isLive: false,
      });
    };

    await refreshTrackedTab(1);

    const record = backgroundStore.trackedTabsById[1];
    assert.equal(record.pageRuntimeReady, true);
    assert.equal(record.pageMediaReady, false);
    assert.equal(record.videoDetails.lengthSeconds, 400);
    assert.equal(record.videoDetails.remainingTime, 400);
    assert.equal(record.isRemainingTimeStale, true);
  },
);
