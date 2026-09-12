import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutoPreparationController } from '../../background/auto-preparation/controller.js';

function harness(overrides = {}) {
  let time = 0;
  const tabs = new Map([1, 2, 3].map(id => [id, { identity: String(id), active: false, loaded: true, ready: false }]));
  const activated = [];
  const refreshed = [];
  const settled = [];
  let done;
  const finished = new Promise(resolve => { done = resolve; });
  const controller = createAutoPreparationController({
    now: () => time, timeoutMs: 60, pollMs: 10, settleMs: 10,
    delay: async ms => { time += ms; },
    inspect: async id => tabs.get(id),
    activate: async id => {
      for (const tab of tabs.values()) tab.active = false;
      tabs.get(id).active = true;
      activated.push(id);
      return true;
    },
    refresh: async id => { refreshed.push(id); tabs.get(id).ready = true; },
    settle: async (id, _windowId, returnTabId, result) => {
      settled.push({ id, returnTabId, ...result });
      return returnTabId ?? 99;
    },
    publish: state => { if (state.status !== 'running') done(state); },
    ...overrides,
  });
  const items = [1, 2, 3].map(id => ({ id, identity: String(id), title: `Video ${id}` }));
  return { controller, tabs, activated, refreshed, settled, items, finished };
}

test('auto-preparation activates each tab and waits for playback readiness before advancing', async () => {
  const h = harness();
  h.tabs.get(2).ready = true;
  assert.equal(h.controller.start(1, h.items).ok, true);
  assert.equal(h.controller.start(1, h.items).ok, false);
  const result = await h.finished;
  assert.deepEqual(h.activated, [1, 3]);
  assert.deepEqual([...new Set(h.refreshed)], [1, 3]);
  assert.equal(result.status, 'complete');
  assert.equal(result.ready, 3);
  assert.deepEqual(h.settled.map(entry => entry.id), [1, 3]);
});

test('stalled tabs time out and do not prevent subsequent tabs from being visited', async () => {
  const h = harness({ refresh: async () => {} });
  h.controller.start(1, h.items);
  const result = await h.finished;
  assert.deepEqual(h.activated, [1, 2, 3]);
  assert.equal(result.skipped, 3);
});

test('Stop prevents further activation even while a read is in flight', async () => {
  let releaseRead;
  let enteredRead;
  const entered = new Promise(resolve => { enteredRead = resolve; });
  const h = harness({ refresh: () => new Promise(resolve => { releaseRead = resolve; enteredRead(); }) });
  h.controller.start(1, h.items);
  await entered;
  h.controller.stop();
  releaseRead();
  await h.finished;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.activated, [1]);
  assert.equal(h.controller.snapshot().status, 'stopped');
});

test('manual tab switching stops auto-preparation instead of taking focus back', async () => {
  const h = harness({ refresh: async id => { h.tabs.get(id).active = false; } });
  h.controller.start(1, h.items);
  assert.equal((await h.finished).status, 'stopped');
  assert.deepEqual(h.activated, [1]);
});

test('removed, navigated and excluded tabs are skipped before activation', async () => {
  const h = harness();
  h.tabs.delete(1);
  h.tabs.get(2).identity = 'different-video';
  h.tabs.get(3).excluded = true;
  h.controller.start(1, h.items);
  assert.equal((await h.finished).skipped, 3);
  assert.deepEqual(h.activated, []);
});

test('a sleeping tab is activated and allowed to load before collecting playback data', async () => {
  let inspections = 0;
  const h = harness({
    timeoutMs: 100,
    inspect: async id => {
      const tab = h.tabs.get(id);
      if (tab.active && ++inspections >= 3) tab.loaded = true;
      return tab;
    },
    refresh: async id => {
      assert.equal(h.tabs.get(id).loaded, true);
      h.refreshed.push(id);
      h.tabs.get(id).ready = true;
    },
  });
  h.tabs.get(1).loaded = false;
  h.tabs.get(1).discarded = true;
  h.controller.start(1, h.items.slice(0, 1), 99);
  const result = await h.finished;
  assert.deepEqual(h.activated, [1]);
  assert.deepEqual([...new Set(h.refreshed)], [1]);
  assert.equal(result.ready, 1);
  assert.deepEqual(h.settled, [{
    id: 1, returnTabId: 99, autoPrepared: true, wasDiscarded: true,
  }]);
});

test('auto-preparation waits again when YouTube restores a saved playback position', async () => {
  let refreshCount = 0;
  const h = harness({
    timeoutMs: 120,
    settleMs: 20,
    refresh: async id => {
      refreshCount += 1;
      const tab = h.tabs.get(id);
      tab.ready = true;
      tab.remainingSeconds = refreshCount < 3 ? 100 : 40;
    },
  });

  h.controller.start(1, h.items.slice(0, 1), 99);
  const result = await h.finished;

  assert.equal(result.ready, 1);
  assert.ok(refreshCount >= 4);
  assert.equal(h.settled[0].autoPrepared, true);
});
