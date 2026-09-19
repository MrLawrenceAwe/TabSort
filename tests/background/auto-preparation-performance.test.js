import assert from 'node:assert/strict';
import test from 'node:test';
import { startAutoPreparation, stopAutoPreparation } from '../../background/auto-preparation/service.js';
import { getAutoPreparation } from '../../background/auto-preparation/state.js';
import { getMutableTabRecord, resetTrackedWindowStore } from '../../background/windows/tracked-window-store.js';
import { reconcileWindowTabRecords } from '../../background/tabs/reconcile-window.js';
import { RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { createChromeTabFixture, ensureChromeApi } from '../helpers/background-test-helpers.js';

function setup(count, onCreate = () => {}) {
  ensureChromeApi({ tabs: true });
  resetTrackedWindowStore({ windowId: 1 });
  const tabs = new Map(Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return [id, createChromeTabFixture(id, { groupId: -1 })];
  }));
  const messages = [];
  const moves = [];
  let nextId = count + 1;
  chrome.runtime.getURL = path => `chrome-extension://test/${path}`;
  chrome.runtime.sendMessage = async message => { messages.push(structuredClone(message)); };
  const saved = {};
  chrome.storage = { session: {
    get: async () => structuredClone(saved),
    set: async values => Object.assign(saved, structuredClone(values)),
    remove: async key => { delete saved[key]; },
  } };
  chrome.tabs.query = async ({ windowId }) => [...tabs.values()].filter(tab => tab.windowId === windowId);
  chrome.tabs.get = async id => {
    if (!tabs.has(id)) throw new Error('No tab');
    return { ...tabs.get(id) };
  };
  chrome.tabs.create = async options => {
    const tab = { id: nextId++, index: tabs.size, groupId: -1, ...options };
    tabs.set(tab.id, tab);
    return { ...tab };
  };
  chrome.tabs.move = async (id, options) => {
    moves.push(id);
    return Object.assign(tabs.get(id), options, { active: false });
  };
  chrome.tabs.update = async (id, options) => Object.assign(tabs.get(id), options);
  chrome.tabs.remove = async id => { tabs.delete(id); };
  chrome.windows = { get: async id => ({ id }), create: async () => { onCreate(); return { id: 99 }; } };
  return { tabs, messages, moves, saved };
}

async function waitForCompletion() {
  for (let i = 0; i < 100 && getAutoPreparation().status === 'running'; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(getAutoPreparation().status, 'complete');
}

test('100 queued tabs that become ready are skipped without moving; progress payloads contain no tab collection', async () => {
  const h = setup(100, () => {
    for (let id = 1; id <= 100; id++) {
      const record = getMutableTabRecord(id);
      record.remainingSecondsStale = false;
      record.videoDetails = { remainingSeconds: 42 };
    }
  });
  assert.equal((await startAutoPreparation({ windowId: 1 })).ok, true);
  await waitForCompletion();
  assert.deepEqual(h.moves, []);
  assert.equal(getAutoPreparation().ready, 100);
  const snapshots = h.messages.filter(message => message.type === RUNTIME_MESSAGE_TYPES.TAB_SNAPSHOT_UPDATED);
  assert.equal(snapshots.length, 1, 'Only startup reconciliation broadcasts the tab collection');
  const progress = h.messages.filter(message => message.type === RUNTIME_MESSAGE_TYPES.AUTO_PREPARATION_UPDATED);
  assert.equal(progress.length, 102);
  assert.ok(progress.every(message => Object.keys(message).sort().join(',') === 'autoPreparation,type'));
  assert.equal(progress.at(-1).autoPreparation.status, 'complete');
});

for (const lateResult of ['metrics', 'noReceiver']) {
  test(`Stop returns the tab while a read is stalled and ignores late ${lateResult}`, { timeout: 2000 }, async () => {
    const h = setup(1);
    let releaseRead;
    let enteredRead;
    let injections = 0;
    const entered = new Promise(resolve => { enteredRead = resolve; });
    chrome.scripting = { executeScript: async () => { injections++; } };
    chrome.tabs.sendMessage = () => new Promise((resolve, reject) => {
      releaseRead = () => lateResult === 'metrics'
        ? resolve({ url: h.tabs.get(1).url, metadataDurationSeconds: 60, mediaDurationSeconds: 60,
          positionSeconds: 20, playbackMetricsReady: true })
        : reject(new Error('Receiving end does not exist'));
      enteredRead();
    });
    await startAutoPreparation({ windowId: 1 });
    await entered;
    try {
      await stopAutoPreparation();
      assert.equal(getAutoPreparation().status, 'stopped');
      assert.equal(h.tabs.get(1).windowId, 1);
      assert.equal(h.tabs.size, 1, 'Placeholder was removed');
      const before = structuredClone(getMutableTabRecord(1));
      releaseRead();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(getMutableTabRecord(1), before);
      assert.equal(injections, 0);
    } finally {
      releaseRead();
      await stopAutoPreparation();
    }
  });
}

for (const failure of ['readError', 'invalidPayload', 'noReceiver']) {
  test(`settling restarts after ${failure} instead of accepting the cached sample`, { timeout: 10000 }, async () => {
    const h = setup(1);
    let reads = 0;
    let failReads = true;
    chrome.scripting = { executeScript: async () => [] };
    chrome.tabs.sendMessage = async id => {
      reads++;
      if (reads > 1 && failReads) {
        if (failure === 'invalidPayload') return null;
        throw new Error(failure === 'noReceiver' ? 'Receiving end does not exist' : 'Read failed');
      }
      return { url: h.tabs.get(id).url, metadataDurationSeconds: 60,
        mediaDurationSeconds: 60, positionSeconds: 20, playbackMetricsReady: true };
    };
    await startAutoPreparation({ windowId: 1 });
    try {
      await new Promise(resolve => setTimeout(resolve, 3600));
      assert.ok(reads >= 7);
      assert.equal(getAutoPreparation().status, 'running');
      assert.equal(getAutoPreparation().ready, 0);
      assert.equal(getAutoPreparation().phase, 'reading');
      failReads = false;
      const deadline = Date.now() + 5000;
      while (getAutoPreparation().status === 'running' && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(getAutoPreparation().status, 'complete');
      assert.equal(getAutoPreparation().ready, 1);
    } finally {
      await stopAutoPreparation();
    }
  });
}

test('awake preparation results survive completion while a different window is tracked', { timeout: 8000 }, async () => {
  const h = setup(1, () => resetTrackedWindowStore({ windowId: 2 }));
  chrome.tabs.sendMessage = async id => ({ url: h.tabs.get(id).url,
    metadataDurationSeconds: 60, mediaDurationSeconds: 60,
    positionSeconds: 20, playbackMetricsReady: true });
  await startAutoPreparation({ windowId: 1 });
  try {
    const deadline = Date.now() + 5000;
    while (getAutoPreparation().status === 'running' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(getAutoPreparation().status, 'complete');
    assert.equal(getAutoPreparation().ready, 1);
    assert.equal(h.saved['autoPreparedTab:1'].discarded, false);
    for (let visit = 0; visit < 2; visit++) {
      await reconcileWindowTabRecords(2, { force: true });
      await reconcileWindowTabRecords(1, { force: true });
      assert.equal(getMutableTabRecord(1).videoDetails.remainingSeconds, 40);
      assert.equal(getMutableTabRecord(1).remainingSecondsStale, false);
    }
  } finally {
    await stopAutoPreparation();
  }
});
