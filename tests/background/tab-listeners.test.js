import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { registerTabAndNavigationListeners } from '../../background/tabs/listeners.js';
import { saveAutoPreparedTab } from '../../background/auto-preparation/session-cache.js';
import { getSortState, getTabRecord } from '../../background/windows/store.js';
import {
  createChromeTabFixture,
  createPlaybackMetricsFixture,
  ensureChromeApi,
  resetTrackedWindowState,
} from '../helpers/background-test-helpers.js';

test('Chrome tab replacement transfers prepared time to the new sleeping tab ID', async (t) => {
  ensureChromeApi({ tabs: true });
  resetTrackedWindowState(1);
  const saved = {};
  chrome.storage = { session: {
    get: async () => ({ ...saved }),
    set: async values => Object.assign(saved, values),
    remove: async key => { delete saved[key]; },
  } };
  t.after(() => { delete chrome.storage; delete chrome.tabs.onReplaced; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const listeners = {};
  for (const event of ['onReplaced', 'onUpdated', 'onMoved', 'onActivated', 'onDetached', 'onAttached', 'onRemoved']) {
    chrome.tabs[event] = { addListener: listener => { listeners[event] = listener; } };
  }
  chrome.webNavigation = { onHistoryStateUpdated: { addListener() {} } };
  const tab = createChromeTabFixture(200, { discarded: true, url: 'https://www.youtube.com/watch?v=same' });
  chrome.tabs.get = async () => tab;
  chrome.tabs.query = async () => [tab];
  await saveAutoPreparedTab({ id: 100, url: tab.url, remainingSecondsStale: false,
    videoDetails: { title: 'Prepared before discard', remainingSeconds: 123 } });
  registerTabAndNavigationListeners();
  await listeners.onReplaced(200, 100);
  t.mock.timers.tick(200);
  await setImmediate();
  assert.equal(getSortState().sortSummary.readyCount, 1);
  assert.equal(getTabRecord(200).videoDetails.remainingSeconds, 123);
  assert.equal(getTabRecord(200).hasAutoPreparedTime, true);
  assert.equal(saved['autoPreparedTab:100'], undefined);
});

for (const queryFails of [false, true]) {
  test(queryFails
    ? 'event bursts skip playback collection when reconciliation fails'
    : 'event bursts reconcile once and collect each tracked video only once', async (t) => {
    ensureChromeApi({ tabs: true });
    resetTrackedWindowState(1);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const listeners = {};
    for (const event of ['onUpdated', 'onMoved', 'onActivated', 'onDetached', 'onAttached', 'onRemoved']) {
      chrome.tabs[event] = { addListener: (listener) => { listeners[event] = listener; } };
    }
    chrome.webNavigation = { onHistoryStateUpdated: { addListener() {} } };
    const tabs = [createChromeTabFixture(1), createChromeTabFixture(2),
      createChromeTabFixture(3, { url: 'https://example.com' })];
    let queries = 0;
    chrome.tabs.query = async () => {
      queries += 1;
      if (queryFails) throw new Error('query failed');
      return tabs;
    };
    chrome.tabs.get = async id => tabs.find(tab => tab.id === id);
    const collected = [];
    chrome.tabs.sendMessage = async id => {
      collected.push(id);
      return createPlaybackMetricsFixture({ tabId: id });
    };
    registerTabAndNavigationListeners();
    for (const tab of tabs) {
      listeners.onUpdated(tab.id, { status: 'loading' }, tab);
      listeners.onUpdated(tab.id, { status: 'complete' }, tab);
      listeners.onActivated({ tabId: tab.id, windowId: 1 });
    }
    t.mock.timers.tick(200);
    await setImmediate();
    assert.equal(queries, 1);
    assert.deepEqual(collected.sort(), queryFails ? [] : [1, 2]);
  });
}

test('discard events reconcile auto-prepared tabs without probing their unloaded pages', async (t) => {
  ensureChromeApi({ tabs: true });
  resetTrackedWindowState(1);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const listeners = {};
  for (const event of ['onUpdated', 'onMoved', 'onActivated', 'onDetached', 'onAttached', 'onRemoved']) {
    chrome.tabs[event] = { addListener: (listener) => { listeners[event] = listener; } };
  }
  chrome.webNavigation = { onHistoryStateUpdated: { addListener() {} } };
  const tab = createChromeTabFixture(1, { discarded: true });
  chrome.tabs.query = async () => [tab];
  chrome.tabs.get = async () => tab;
  const collected = [];
  chrome.tabs.sendMessage = async id => {
    collected.push(id);
    return createPlaybackMetricsFixture({ tabId: id });
  };

  registerTabAndNavigationListeners();
  listeners.onUpdated(tab.id, { discarded: true }, tab);
  t.mock.timers.tick(200);
  await setImmediate();

  assert.deepEqual(collected, []);
});
