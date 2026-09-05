import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { registerTabAndNavigationListeners } from '../../background/tabs/listeners.js';
import {
  createChromeTabFixture,
  createPlaybackMetricsFixture,
  ensureChromeApi,
  resetTrackedWindowState,
} from '../helpers/background-test-helpers.js';

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
    chrome.tabs.query = (_query, callback) => {
      queries += 1;
      chrome.runtime.lastError = queryFails ? new Error('query failed') : null;
      callback(tabs);
      chrome.runtime.lastError = null;
    };
    chrome.tabs.get = (id, callback) => callback(tabs.find((tab) => tab.id === id));
    const collected = [];
    chrome.tabs.sendMessage = (id, _message, callback) => {
      collected.push(id);
      callback(createPlaybackMetricsFixture({ tabId: id }));
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
