import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutoPreparationController } from '../../background/auto-preparation/controller.js';

function harness(overrides = {}) {
  let time = 0;
  const tabs = new Map([1, 2, 3].map(id => [id, { videoId: String(id), active: false, loaded: true, ready: false }]));
  const activated = [];
  const refreshed = [];
  const finishedTabs = [];
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
    finishTabPreparation: async (id, _windowId, result) => {
      finishedTabs.push({ id, ...result });
    },
    publish: state => { if (state.status !== 'running') done(state); },
    ...overrides,
  });
  const items = [1, 2, 3].map(id => ({ id, videoId: String(id), title: `Video ${id}` }));
  return { controller, tabs, activated, refreshed, finishedTabs, items, finished };
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
  assert.deepEqual(h.finishedTabs.map(entry => entry.id), [1, 3]);
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
  h.tabs.get(2).videoId = 'different-video';
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
  h.controller.start(1, h.items.slice(0, 1));
  const result = await h.finished;
  assert.deepEqual(h.activated, [1]);
  assert.deepEqual([...new Set(h.refreshed)], [1]);
  assert.equal(result.ready, 1);
  assert.deepEqual(h.finishedTabs, [{
    id: 1, autoPrepared: true, wasDiscarded: true,
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

  h.controller.start(1, h.items.slice(0, 1));
  const result = await h.finished;

  assert.equal(result.ready, 1);
  assert.ok(refreshCount >= 4);
  assert.equal(h.finishedTabs[0].autoPrepared, true);
});


test('Stop waits for a pending activation and returns the tab before allowing a new run', async () => {
  let release;
  let entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const h = harness({ activate: () => new Promise(resolve => { release = resolve; entered(); }) });
  h.controller.start(1, h.items);
  await waiting;
  const stopped = h.controller.stop();
  assert.equal(h.controller.start(1, h.items).ok, false);
  assert.equal(h.controller.snapshot().status, 'running');
  release(true);
  await stopped;
  assert.deepEqual(h.finishedTabs.map(tab => tab.id), [1]);
  assert.equal(h.controller.snapshot().status, 'stopped');
});

test('a failed move still runs restoration and workspace cleanup', async () => {
  let cleaned = false;
  const h = harness({ activate: async () => { throw new Error('move failed'); }, cleanup: async () => { cleaned = true; } });
  h.controller.start(1, h.items);
  const result = await h.finished;
  assert.equal(result.reason, 'move failed');
  assert.equal(h.finishedTabs.length, 1);
  assert.equal(cleaned, true);
});

test('a tab selected by the user before moving is skipped and counted', async () => {
  const h = harness({ activate: async () => false });
  h.controller.start(1, h.items);
  const result = await h.finished;
  assert.equal(result.completed, 3);
  assert.equal(result.skipped, 3);
});

test('a pending return is visible in status and Stop reports that it is waiting', async () => {
  let releaseReturn;
  let enteredReturn;
  const returning = new Promise(resolve => { enteredReturn = resolve; });
  const h = harness({ finishTabPreparation: () => new Promise(resolve => { releaseReturn = resolve; enteredReturn(); }) });
  h.controller.start(1, h.items);
  await returning;
  assert.equal(h.controller.snapshot().phase, 'returning');
  const stopped = h.controller.stop();
  assert.equal(h.controller.snapshot().phase, 'stopping');
  releaseReturn();
  await stopped;
  assert.equal(h.controller.snapshot().status, 'stopped');
  assert.equal(h.controller.snapshot().phase, null);
});
