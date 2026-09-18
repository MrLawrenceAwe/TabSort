import assert from 'node:assert/strict';
import test from 'node:test';
import { startAutoPreparation, stopAutoPreparation } from '../../background/auto-preparation/service.js';
import { getAutoPreparation, getProgressWindowId } from '../../background/auto-preparation/state.js';
import { resetTrackedWindowStore } from '../../background/windows/store.js';
import { createChromeTabFixture, ensureChromeApi } from '../helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test('does not open TikTok PiP when preparation has no eligible videos', async () => {
  resetTrackedWindowStore({ windowId: 1 });
  chrome.storage = { session: { get: async () => ({}), set: async () => {}, remove: async () => {} } };
  chrome.tabs.query = async () => [
    createChromeTabFixture(1, { windowId: 1, url: 'https://example.com', active: true }),
  ];
  let pipRequests = 0;
  chrome.runtime.sendMessage = async (...args) => {
    if (typeof args[0] === 'string') pipRequests += 1;
    return { ok: true };
  };

  const result = await startAutoPreparation({ windowId: 1, openTikTokPip: true });

  assert.deepEqual(result, { ok: false, error: 'noUnreadyTabs' });
  assert.equal(pipRequests, 0);
});

test('changing the tracked window during setup does not cancel preparation or move the user’s active tab', async () => {
  resetTrackedWindowStore({ windowId: 1 });
  const saved = {};
  chrome.storage = { session: {
    get: async () => saved,
    set: async data => Object.assign(saved, data),
    remove: async key => { delete saved[key]; },
  } };
  chrome.runtime.getURL = path => `chrome-extension://test/${path}`;
  const tab = createChromeTabFixture(1, { windowId: 1, active: true });
  chrome.tabs.query = async () => [tab];
  chrome.tabs.get = async () => tab;
  chrome.tabs.move = async () => { assert.fail('active browsing tab must not move'); };
  chrome.windows = {
    get: async id => ({ id }),
    create: async () => {
      resetTrackedWindowStore({ windowId: 2 });
      return { id: 99, tabs: [{ id: 100 }] };
    },
  };
  const result = await startAutoPreparation({ windowId: 1 });
  assert.equal(result.ok, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(getAutoPreparation().status, 'complete');
  assert.equal(getAutoPreparation().skipped, 1);
  assert.equal(getProgressWindowId(), 99);
  await stopAutoPreparation();
});

test('a sleeping tab returns to sleep and retains its result when Chrome replaces its ID', async () => {
  resetTrackedWindowStore({ windowId: 1 });
  const saved = {};
  chrome.storage.session = {
    get: async () => structuredClone(saved),
    set: async data => Object.assign(saved, structuredClone(data)),
    remove: async key => { delete saved[key]; },
  };
  const tabs = new Map([
    [1, createChromeTabFixture(1, { windowId: 1, active: true, url: 'https://example.com', index: 0 })],
    [2, createChromeTabFixture(2, { windowId: 1, active: false, discarded: true, index: 1 })],
  ]);
  let nextId = 300;
  chrome.tabs.query = async ({ windowId }) => [...tabs.values()].filter(tab => tab.windowId === windowId);
  chrome.tabs.get = async id => { if (!tabs.has(id)) throw new Error('No tab'); return { ...tabs.get(id) }; };
  chrome.tabs.create = async options => {
    const tab = { id: nextId++, groupId: -1, ...options };
    tabs.set(tab.id, tab);
    return { ...tab };
  };
  chrome.tabs.move = async (id, options) => Object.assign(tabs.get(id), options, { active: false });
  chrome.tabs.update = async (id, options) => Object.assign(tabs.get(id), options, { discarded: false, status: 'complete' });
  chrome.tabs.reload = async id => Object.assign(tabs.get(id), { discarded: false, status: 'loading' });
  chrome.tabs.remove = async id => { tabs.delete(id); };
  chrome.tabs.sendMessage = async id => ({
    url: tabs.get(id).url, metadataDurationSeconds: 60, mediaDurationSeconds: 60,
    positionSeconds: 20, playbackMetricsReady: true,
  });
  chrome.tabs.discard = async id => {
    const replacement = { ...tabs.get(id), id: 222, discarded: true };
    tabs.delete(id);
    tabs.set(replacement.id, replacement);
    return replacement;
  };
  chrome.windows = {
    get: async id => ({ id }),
    create: async () => ({ id: 199, tabs: [{ id: 200 }] }),
  };
  assert.equal((await startAutoPreparation({ windowId: 1 })).ok, true);
  const deadline = Date.now() + 8000;
  while (getAutoPreparation().status === 'running' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.equal(getAutoPreparation().status, 'complete');
  assert.equal(getAutoPreparation().ready, 1);
  assert.equal(tabs.has(2), false);
  assert.equal(tabs.get(222).discarded, true);
  assert.equal(tabs.get(222).windowId, 1);
  assert.equal(tabs.get(1).active, true);
  assert.equal(saved['autoPreparedTab:222'].videoDetails.remainingSeconds, 40);
});
