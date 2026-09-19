import assert from 'node:assert/strict';
import test from 'node:test';
import { startAutoPreparation, stopAutoPreparation } from '../../background/auto-preparation/service.js';
import { getAutoPreparation, getProgressWindowId } from '../../background/auto-preparation/state.js';
import { replaceAllTabRecords, resetTrackedWindowStore } from '../../background/windows/tracked-window-store.js';
import { createChromeTabFixture, createTabRecordFixture, ensureChromeApi } from '../helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test('Stop cancels a start that is waiting for the optional TikTok PiP request', async () => {
  resetTrackedWindowStore({ windowId: 1 });
  chrome.storage = { session: { get: async () => ({}), set: async () => {}, remove: async () => {} } };
  chrome.runtime.getURL = path => `chrome-extension://test/${path}`;
  const tab = createChromeTabFixture(1, { windowId: 1, active: false });
  chrome.tabs.query = async () => [tab];
  chrome.tabs.get = async () => tab;
  let createWorkspaceCalls = 0;
  chrome.windows = {
    get: async id => ({ id }),
    create: async () => { createWorkspaceCalls += 1; return { id: 99 }; },
  };

  let resolvePipRequest;
  const pipRequestStarted = new Promise(resolve => { resolvePipRequest = resolve; });
  chrome.runtime.sendMessage = async (...args) => {
    if (typeof args[0] !== 'string') return undefined;
    resolvePipRequest();
    return new Promise(resolve => { resolvePipRequest = () => resolve({ ok: true }); });
  };

  const start = startAutoPreparation({ windowId: 1, openTikTokPip: true });
  await pipRequestStarted;
  const stop = await stopAutoPreparation();
  const startResult = await start;
  resolvePipRequest();

  assert.equal(stop.ok, true);
  assert.deepEqual(startResult, { ok: false, error: 'startCancelled' });
  assert.equal(createWorkspaceCalls, 0);
});

test('Stop removes the unstarted preparation progress tab when window creation finishes late', async () => {
  resetTrackedWindowStore({ windowId: 1 });
  const saved = {};
  chrome.storage = { session: {
    get: async () => saved,
    set: async data => Object.assign(saved, data),
    remove: async key => { delete saved[key]; },
  } };
  chrome.runtime.getURL = path => `chrome-extension://test/${path}`;
  const sourceTab = createChromeTabFixture(1, { windowId: 1, active: false });
  const progressTab = createChromeTabFixture(99, {
    windowId: 9,
    url: chrome.runtime.getURL('preparation/index.html'),
  });
  chrome.tabs.query = async ({ windowId } = {}) => windowId === 9 ? [progressTab] : [sourceTab];
  chrome.tabs.get = async () => sourceTab;
  let removeProgressTabId = null;
  chrome.tabs.remove = async id => { removeProgressTabId = id; };

  let resolveCreatedWindow;
  let signalCreateStarted;
  const createStarted = new Promise(resolve => { signalCreateStarted = resolve; });
  chrome.windows = {
    get: async id => ({ id }),
    create: async () => {
      signalCreateStarted();
      return new Promise(resolve => { resolveCreatedWindow = () => resolve({ id: 9 }); });
    },
  };

  const start = startAutoPreparation({ windowId: 1 });
  await createStarted;
  const stop = await stopAutoPreparation();
  resolveCreatedWindow();

  assert.equal(stop.ok, true);
  assert.deepEqual(await start, { ok: false, error: 'startCancelled' });
  assert.equal(removeProgressTabId, 99);
  assert.equal(getProgressWindowId(), null);
  assert.equal(saved.autoPreparationWorkspace, undefined);
});

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

test('changing the tracked window during the setup query keeps preparation candidates in the source window', async () => {
  resetTrackedWindowStore({ windowId: 1 });
  const saved = {};
  chrome.storage = { session: {
    get: async () => saved,
    set: async data => Object.assign(saved, data),
    remove: async key => { delete saved[key]; },
  } };
  chrome.runtime.getURL = path => `chrome-extension://test/${path}`;
  const tab = createChromeTabFixture(1, { windowId: 1, active: true });
  let queryCount = 0;
  chrome.tabs.query = async () => {
    if (++queryCount === 2) {
      resetTrackedWindowStore({ windowId: 2 });
      replaceAllTabRecords({
        20: createTabRecordFixture(20, { windowId: 2 }),
        21: createTabRecordFixture(21, { windowId: 2 }),
      });
    }
    return [tab];
  };
  chrome.tabs.get = async () => tab;
  chrome.tabs.move = async () => { assert.fail('active browsing tab must not move'); };
  chrome.windows = {
    get: async id => ({ id }),
    create: async () => ({ id: 99, tabs: [{ id: 100 }] }),
  };
  const result = await startAutoPreparation({ windowId: 1 });
  assert.equal(result.ok, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(getAutoPreparation().status, 'complete');
  assert.equal(getAutoPreparation().total, 1);
  assert.equal(getAutoPreparation().skipped, 1);
  assert.equal(getProgressWindowId(), 99);
  await stopAutoPreparation();
});

test('a sleeping tab retains its preparation record across a setup window switch and Chrome ID replacement', async () => {
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
    create: async () => {
      resetTrackedWindowStore({ windowId: 2 });
      return { id: 199, tabs: [{ id: 200 }] };
    },
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
