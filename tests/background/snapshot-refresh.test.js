import assert from 'node:assert/strict';
import test from 'node:test';

import { getWindowSnapshot, handleOrganiseTabs } from '../../background/messaging/tab-commands.js';
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
  'getWindowSnapshot refreshes ready awake tabs as well as pending readings',
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

    assert.deepEqual(refreshedTabIds, [1, 2]);
    assert.equal(snapshot.tabRecordsById[1].videoDetails.remainingSeconds, 100);
    assert.equal(snapshot.tabRecordsById[2].videoDetails.remainingSeconds, 100);

    globalThis.chrome.tabs.sendMessage = async tabId => ({
      url: `https://www.youtube.com/watch?v=${tabId}`,
      playbackMetricsReady: true, metadataDurationSeconds: 120,
      mediaDurationSeconds: 120, positionSeconds: 100, playbackRate: 2, isLive: false,
    });
    const afterSeekAndSpeedChange = await getWindowSnapshot({ windowId: 1 });
    assert.equal(afterSeekAndSpeedChange.tabRecordsById[2].videoDetails.remainingSeconds, 10);
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

test('organising refreshes playback before deciding the order', { concurrency: false }, async () => {
  resetTrackedWindowState(1);
  const tabs = [createChromeTabFixture(1), createChromeTabFixture(2)];
  setTrackedTabRecords({
    1: createTabRecordFixture(1, { index: 0, remainingSecondsStale: false,
      videoDetails: { remainingSeconds: 20, lengthSeconds: 120 } }),
    2: createTabRecordFixture(2, { index: 1, remainingSecondsStale: false,
      videoDetails: { remainingSeconds: 100, lengthSeconds: 120 } }),
  });
  stubChromeTabQuery(tabs);
  globalThis.chrome.tabs.get = async id => tabs.find(tab => tab.id === id);
  globalThis.chrome.tabs.sendMessage = async id => ({
    url: tabs[id - 1].url, playbackMetricsReady: true, isLive: false,
    metadataDurationSeconds: 120, mediaDurationSeconds: 120,
    positionSeconds: id === 1 ? 0 : 110, playbackRate: 1,
  });
  const moves = [];
  globalThis.chrome.tabs.move = async ids => { moves.push(ids); };
  assert.equal((await handleOrganiseTabs({ windowId: 1 })).ok, true);
  assert.deepEqual(moves, [[2, 1]]);
});
