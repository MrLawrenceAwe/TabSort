import assert from 'node:assert/strict';
import test from 'node:test';

import { getWindowSnapshot } from '../../background/tab-command-handlers.js';
import {
  ensureChromeApi,
  createChromeTabFixture,
  createTabRecordFixture,
  resetTrackedWindowState,
  setTrackedTabRecords,
  stubChromeTabQuery,
  stubChromeTabGet,
} from '../helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test(
  'getWindowSnapshot refreshes only records whose metrics can self-resolve',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    const now = Date.now();
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        isActiveTab: true,
        contentScriptReported: true,
        mediaElementObserved: false,
        videoWaitStartedAt: now,
        remainingTimeStale: true,
      }),
      2: createTabRecordFixture(2, {
        videoDetails: { title: 'Video 2', remainingTime: 90, lengthSeconds: 120 },
        remainingTimeStale: false,
      }),
    });

    stubChromeTabQuery([createChromeTabFixture(1, { active: true }), createChromeTabFixture(2)]);
    globalThis.chrome.tabs.get = (tabId, callback) => {
      callback({
        id: tabId,
        windowId: 1,
        url: `https://www.youtube.com/watch?v=${tabId}`,
        active: tabId === 1,
        hidden: false,
      });
    };

    const refreshedTabIds = [];
    globalThis.chrome.tabs.sendMessage = (tabId, _payload, callback) => {
      refreshedTabIds.push(tabId);
      callback({
        title: `Video ${tabId}`,
        url: `https://www.youtube.com/watch?v=${tabId}`,
        mediaElementObserved: true,
        lengthSeconds: 120,
        currentTime: 20,
        playbackRate: 1,
        paused: false,
        isLive: false,
      });
    };

    const snapshot = await getWindowSnapshot({ windowId: 1 });

    assert.deepEqual(refreshedTabIds, [1]);
    assert.equal(snapshot.tabRecordsById[1].videoDetails.remainingTime, 100);
    assert.equal(snapshot.tabRecordsById[2].videoDetails.remainingTime, 90);
  },
);

test(
  'getWindowSnapshot probes active stale tabs even after reload guidance appears',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        isActiveTab: true,
        contentScriptReported: false,
        mediaElementObserved: false,
        transitionStartedAt: Date.now() - 10_000,
        videoWaitStartedAt: null,
        remainingTimeStale: true,
        videoDetails: null,
      }),
    });

    stubChromeTabQuery([
      createChromeTabFixture(1, {
        url: 'https://www.youtube.com/watch?v=archive',
        active: true,
      }),
    ]);
    stubChromeTabGet({
      tabId: 1,
      url: 'https://www.youtube.com/watch?v=archive',
      active: true,
    });

    const refreshedTabIds = [];
    globalThis.chrome.tabs.sendMessage = (tabId, _payload, callback) => {
      refreshedTabIds.push(tabId);
      callback({
        title: 'Archived Stream',
        url: 'https://www.youtube.com/watch?v=archive',
        mediaElementObserved: false,
        lengthSeconds: null,
        duration: 6211,
        currentTime: 0,
        playbackRate: 1,
        paused: true,
        isLive: false,
      });
    };

    const snapshot = await getWindowSnapshot({ windowId: 1 });

    assert.deepEqual(refreshedTabIds, [1]);
    assert.equal(snapshot.tabRecordsById[1].mediaElementObserved, true);
    assert.equal(snapshot.tabRecordsById[1].videoDetails.remainingTime, 6211);
    assert.equal(snapshot.tabRecordsById[1].remainingTimeStale, false);
  },
);
