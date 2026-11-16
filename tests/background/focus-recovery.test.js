import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { createPreparationFocusRecovery } from '../../background/auto-preparation/focus-recovery.js';

afterEach(() => { delete globalThis.chrome; });

function harness(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let focused = { id: 1, focused: true };
  const updates = [];
  globalThis.chrome = { windows: {
    getLastFocused: async () => focused,
    update: async (id, options) => {
      updates.push({ id, ...options });
      focused = { id, focused: true };
    },
  } };
  return { recovery: createPreparationFocusRecovery(), updates,
    signal: new AbortController().signal, focus: id => { focused = { id, focused: true }; } };
}

test('stalled playback gets one three-second focus opportunity after one second', async t => {
  const h = harness(t);
  await h.recovery.recover(2, h.signal);
  assert.deepEqual(h.updates, []);
  t.mock.timers.tick(999);
  await h.recovery.recover(2, h.signal);
  assert.deepEqual(h.updates, []);
  t.mock.timers.tick(1);
  await h.recovery.recover(2, h.signal);
  assert.deepEqual(h.updates, [{ id: 2, focused: true }]);
  t.mock.timers.tick(3000);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.updates, [{ id: 2, focused: true }, { id: 1, focused: true }]);
  await h.recovery.recover(2, h.signal);
  assert.equal(h.updates.length, 2);
  await h.recovery.reset();
});

test('Stop or success restores focus early and cancels the timer', async t => {
  const h = harness(t);
  await h.recovery.recover(2, h.signal);
  t.mock.timers.tick(1000);
  await h.recovery.recover(2, h.signal);
  await h.recovery.reset();
  t.mock.timers.tick(3000);
  assert.deepEqual(h.updates.map(update => update.id), [2, 1]);
});

test('an inactive Chrome window does not consume the foreground opportunity', async t => {
  const h = harness(t);
  await h.recovery.recover(2, h.signal);
  chrome.windows.getLastFocused = async () => ({ id: 1, focused: false });
  t.mock.timers.tick(1000);
  await h.recovery.recover(2, h.signal);
  assert.deepEqual(h.updates, []);
  // The user returns to Chrome during the same attempt. Recovery must happen
  // on the next poll, rather than waiting for a sixty-second reload and retry.
  chrome.windows.getLastFocused = async () => ({ id: 1, focused: true });
  t.mock.timers.tick(500);
  await h.recovery.recover(2, h.signal);
  assert.deepEqual(h.updates, [{ id: 2, focused: true }]);
  await h.recovery.reset();
});

test('a user window switch is never overridden by focus restoration', async t => {
  const h = harness(t);
  await h.recovery.recover(2, h.signal);
  t.mock.timers.tick(1000);
  await h.recovery.recover(2, h.signal);
  h.focus(3);
  await h.recovery.reset();
  assert.deepEqual(h.updates.map(update => update.id), [2]);
});

test('cancellation during focus acquisition immediately restores the previous window', async t => {
  const h = harness(t);
  const controller = new AbortController();
  await h.recovery.recover(2, controller.signal);
  const update = chrome.windows.update;
  chrome.windows.update = async (...args) => { await update(...args); controller.abort(); };
  t.mock.timers.tick(1000);
  await h.recovery.recover(2, controller.signal);
  assert.deepEqual(h.updates.map(update => update.id), [2, 1]);
  await h.recovery.reset();
});
