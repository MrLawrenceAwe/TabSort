import assert from 'node:assert/strict';
import test from 'node:test';

import { getWindowSnapshot } from '../../background/messaging/tab-commands.js';
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
        isActive: true,
        contentScriptReady: true,
        playbackMetricsReady: false,
        metricsWaitStartedAt: now,
        remainingSecondsStale: true,
      }),
      2: createTabRecordFixture(2, {
        videoDetails: { title: 'Video 2', remainingSeconds: 90, lengthSeconds: 120 },
        remainingSecondsStale: false,
      }),
    });

    stubChromeTabQuery([createChromeTabFixture(1, { active: true }), createChromeTabFixture(2)]);
    globalThis.chrome.tabs.get = async tabId => ({
        id: tabId,
        windowId: 1,
        url: `https://www.youtube.com/watch?v=${tabId}`,
        active: tabId === 1,
        hidden: false,
      });

    const refreshedTabIds = [];
    globalThis.chrome.tabs.sendMessage = async tabId => {
      refreshedTabIds.push(tabId);
      return {
        title: `Video ${tabId}`,
        url: `https://www.youtube.com/watch?v=${tabId}`,
        playbackMetricsReady: true,
        metadataDurationSeconds: 120,
        positionSeconds: 20,
        playbackRate: 1,
        isLive: false,
      };
    };

    const snapshot = await getWindowSnapshot({ windowId: 1 });

    assert.deepEqual(refreshedTabIds, [1]);
    assert.equal(snapshot.tabRecordsById[1].videoDetails.remainingSeconds, 100);
    assert.equal(snapshot.tabRecordsById[2].videoDetails.remainingSeconds, 90);
  },
);

test(
  'getWindowSnapshot probes active stale tabs even after reload guidance appears',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    setTrackedTabRecords({
      1: createTabRecordFixture(1, {
        isActive: true,
        contentScriptReady: false,
        playbackMetricsReady: false,
        transitionStartedAt: Date.now() - 10_000,
        metricsWaitStartedAt: null,
        remainingSecondsStale: true,
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
    globalThis.chrome.tabs.sendMessage = async tabId => {
      refreshedTabIds.push(tabId);
      return {
        title: 'Archived Stream',
        url: 'https://www.youtube.com/watch?v=archive',
        playbackMetricsReady: false,
        metadataDurationSeconds: null,
        mediaDurationSeconds: 6211,
        positionSeconds: 0,
        playbackRate: 1,
        isLive: false,
      };
    };

    const snapshot = await getWindowSnapshot({ windowId: 1 });

    assert.deepEqual(refreshedTabIds, [1]);
    assert.equal(snapshot.tabRecordsById[1].playbackMetricsReady, true);
    assert.equal(snapshot.tabRecordsById[1].videoDetails.remainingSeconds, 6211);
    assert.equal(snapshot.tabRecordsById[1].remainingSecondsStale, false);
  },
);
