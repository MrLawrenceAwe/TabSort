import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../../shared/tab-states.js';
import { trackedWindowState } from '../../background/tracked-window-state.js';
import { refreshTabPlaybackState } from '../../background/tab-playback-state.js';
import { syncWindowTabRecords } from '../../background/tab-record-sync.js';
import {
  ensureChromeApi,
  makeTabRecord,
  resetTrackedWindowState,
} from '../helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test(
  'refreshTabPlaybackState applies updates to the latest record object after async boundaries',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    const initialRecord = makeTabRecord(1, { pageRuntimeReady: false });
    trackedWindowState.tabRecordsById = { 1: initialRecord };

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

    const refreshPromise = refreshTabPlaybackState(1);

    const replacementRecord = makeTabRecord(1, { pageRuntimeReady: false });
    trackedWindowState.tabRecordsById = { 1: replacementRecord };

    await refreshPromise;

    assert.equal(trackedWindowState.tabRecordsById[1], replacementRecord);
    assert.equal(replacementRecord.pageRuntimeReady, true);
    assert.equal(replacementRecord.videoDetails.lengthSeconds, 120);
    assert.equal(replacementRecord.videoDetails.remainingTime, 100);
    assert.equal(replacementRecord.isRemainingTimeStale, false);
  },
);

test(
  'syncWindowTabRecords does not mark already-open unsuspended tabs as recently unsuspended on initial rehydrate',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();

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

    await syncWindowTabRecords(1, { force: true });

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.status, TAB_STATES.UNSUSPENDED);
    assert.equal(record.unsuspendedTimestamp, null);
  },
);

test(
  'syncWindowTabRecords keeps the recent unsuspend grace for real suspended-to-unsuspended transitions',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    trackedWindowState.tabRecordsById = {
      1: makeTabRecord(1, {
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

    await syncWindowTabRecords(1, { force: true });

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.status, TAB_STATES.UNSUSPENDED);
    assert.equal(typeof record.unsuspendedTimestamp, 'number');
  },
);

test(
  'syncWindowTabRecords resets runtime readiness when a tracked tab navigates to a new video URL',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    trackedWindowState.tabRecordsById = {
      1: makeTabRecord(1, {
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

    await syncWindowTabRecords(1, { force: true });

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
    assert.equal(record.pageRuntimeReady, false);
    assert.equal(record.pageMediaReady, false);
    assert.equal(record.videoDetails, null);
    assert.equal(record.isLiveStream, false);
    assert.equal(record.isRemainingTimeStale, true);
  },
);

test(
  'syncWindowTabRecords preserves readiness when only watch URL parameters change',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    trackedWindowState.tabRecordsById = {
      1: makeTabRecord(1, {
        url: 'https://www.youtube.com/watch?v=same',
        pageMediaReady: true,
        pageRuntimeReady: true,
        videoDetails: { title: 'Same Video', remainingTime: 45, lengthSeconds: 120 },
        isRemainingTimeStale: false,
      }),
    };

    globalThis.chrome.tabs.query = (_query, callback) => {
      callback([
        {
          id: 1,
          windowId: 1,
          url: 'https://www.youtube.com/watch?v=same&list=abc123&index=10',
          index: 0,
          pinned: false,
          status: 'complete',
          active: false,
          hidden: false,
          discarded: false,
        },
      ]);
    };

    await syncWindowTabRecords(1, { force: true });

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=same&list=abc123&index=10');
    assert.equal(record.pageRuntimeReady, true);
    assert.equal(record.pageMediaReady, true);
    assert.deepEqual(record.videoDetails, {
      title: 'Same Video',
      remainingTime: 45,
      lengthSeconds: 120,
    });
    assert.equal(record.isRemainingTimeStale, false);
  },
);

test(
  'syncWindowTabRecords preserves tracked state when the primary tab query fails',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    trackedWindowState.tabRecordsById = {
      1: makeTabRecord(1, {
        videoDetails: { title: 'Video 1', remainingTime: 90, lengthSeconds: 120 },
        isRemainingTimeStale: false,
      }),
    };
    trackedWindowState.visibleOrder = [1];
    trackedWindowState.targetOrder = [1];

    globalThis.chrome.tabs.query = (query, callback) => {
      globalThis.chrome.runtime.lastError =
        query.hidden === true ? null : new Error('query failed');
      callback([]);
      globalThis.chrome.runtime.lastError = null;
    };

    await syncWindowTabRecords(1, { force: true });

    assert.deepEqual(Object.keys(trackedWindowState.tabRecordsById), ['1']);
    assert.deepEqual(trackedWindowState.visibleOrder, [1]);
    assert.deepEqual(trackedWindowState.targetOrder, [1]);
    assert.equal(trackedWindowState.tabRecordsById[1].videoDetails.remainingTime, 90);
  },
);

test(
  'refreshTabPlaybackState updates the stored URL when collected metrics come from a new watch page',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    trackedWindowState.tabRecordsById = {
      1: makeTabRecord(1, {
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

    await refreshTabPlaybackState(1);

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
    assert.equal(record.videoDetails.title, 'New Video');
    assert.equal(record.videoDetails.lengthSeconds, 400);
    assert.equal(record.videoDetails.remainingTime, 390);
    assert.equal(record.isRemainingTimeStale, false);
  },
);

test(
  'refreshTabPlaybackState ignores async metric payloads that no longer match the tracked URL',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    trackedWindowState.tabRecordsById = {
      1: makeTabRecord(1, {
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

    const refreshPromise = refreshTabPlaybackState(1);

    trackedWindowState.tabRecordsById[1] = makeTabRecord(1, {
      url: 'https://www.youtube.com/watch?v=new',
      pageRuntimeReady: false,
      pageMediaReady: false,
      videoDetails: null,
      isRemainingTimeStale: true,
    });

    await refreshPromise;

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.url, 'https://www.youtube.com/watch?v=new');
    assert.equal(record.videoDetails, null);
    assert.equal(record.pageRuntimeReady, false);
    assert.equal(record.pageMediaReady, false);
    assert.equal(record.isRemainingTimeStale, true);
  },
);

test(
  'refreshTabPlaybackState keeps remaining time stale until the current page reports media ready',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    trackedWindowState.tabRecordsById = {
      1: makeTabRecord(1, {
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

    await refreshTabPlaybackState(1);

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.pageRuntimeReady, true);
    assert.equal(record.pageMediaReady, false);
    assert.equal(record.videoDetails.lengthSeconds, 400);
    assert.equal(record.videoDetails.remainingTime, 400);
    assert.equal(record.isRemainingTimeStale, true);
  },
);

test(
  'refreshTabPlaybackState keeps remaining time stale when page metadata and video duration disagree',
  { concurrency: false },
  async () => {
    resetTrackedWindowState();
    trackedWindowState.tabRecordsById = {
      1: makeTabRecord(1, {
        url: 'https://www.youtube.com/watch?v=previous',
        pageRuntimeReady: true,
        pageMediaReady: true,
        videoDetails: {
          title: 'OpenAI vs. Anthropic\'s Direct Faceoff + Future of Agents - With Aaron Levie',
          remainingTime: 3364,
          lengthSeconds: 3364,
        },
        isRemainingTimeStale: false,
      }),
    };

    globalThis.chrome.tabs.get = (_tabId, callback) => {
      callback({
        id: 1,
        windowId: 1,
        url: 'https://www.youtube.com/watch?v=previous',
        active: false,
        hidden: false,
      });
    };

    globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
      callback({
        title: 'OpenAI vs. Anthropic\'s Direct Faceoff + Future of Agents - With Aaron Levie',
        url: 'https://www.youtube.com/watch?v=previous',
        pageMediaReady: true,
        lengthSeconds: null,
        duration: 72,
        currentTime: 72,
        playbackRate: 1,
        paused: false,
        isLive: false,
      });
    };

    await refreshTabPlaybackState(1);

    const record = trackedWindowState.tabRecordsById[1];
    assert.equal(record.pageRuntimeReady, true);
    assert.equal(record.pageMediaReady, false);
    assert.equal(record.videoDetails.lengthSeconds, 3364);
    assert.equal(record.videoDetails.remainingTime, 3364);
    assert.equal(record.isRemainingTimeStale, true);
  },
);
