import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DONE_BADGE_DURATION_MS,
  queueAutoPreparationToolbarIndicator,
  updateAutoPreparationToolbarIndicator,
} from '../../background/toolbar-indicator.js';

function createActionSpy() {
  const calls = [];
  return {
    calls,
    setBadgeText: async value => { calls.push(['setBadgeText', value]); },
    setBadgeBackgroundColor: async value => { calls.push(['setBadgeBackgroundColor', value]); },
    setTitle: async value => { calls.push(['setTitle', value]); },
  };
}

test('shows a green DONE badge when auto-preparation completes', async () => {
  const action = createActionSpy();

  await updateAutoPreparationToolbarIndicator({ status: 'complete' }, action);

  assert.deepEqual(action.calls, [
    ['setBadgeText', { text: 'DONE' }],
    ['setTitle', { title: 'TabSort — Auto-prepare complete' }],
    ['setBadgeBackgroundColor', { color: '#188038' }],
  ]);
});

test('shows current preparation progress while running and clears it when stopped', async () => {
  const action = createActionSpy();

  await updateAutoPreparationToolbarIndicator({
    status: 'running', total: 8, completed: 2, currentTabId: 42,
  }, action);
  await updateAutoPreparationToolbarIndicator({ status: 'stopped' }, action);

  assert.deepEqual(action.calls, [
    ['setBadgeText', { text: '3/8' }],
    ['setTitle', { title: 'TabSort — Auto-preparing tabs 3/8' }],
    ['setBadgeBackgroundColor', { color: '#1a73e8' }],
    ['setBadgeText', { text: '' }],
    ['setTitle', { title: 'TabSort' }],
  ]);
});

test('queues completion after a delayed running-state update', async () => {
  let releaseRunningUpdate;
  let signalRunningUpdate;
  const runningUpdateStarted = new Promise(resolve => { signalRunningUpdate = resolve; });
  const badgeText = [];
  const action = {
    setBadgeText: ({ text }) => {
      badgeText.push(text);
      if (text !== '1/3') return Promise.resolve();
      signalRunningUpdate();
      return new Promise(resolve => { releaseRunningUpdate = resolve; });
    },
    setBadgeBackgroundColor: async () => {},
    setTitle: async () => {},
  };
  const timer = { set: () => null, clear: () => {} };

  const running = queueAutoPreparationToolbarIndicator({
    status: 'running', total: 3, completed: 0, currentTabId: 1,
  }, action, timer);
  await runningUpdateStarted;
  const complete = queueAutoPreparationToolbarIndicator({ status: 'complete' }, action, timer);
  releaseRunningUpdate();
  await Promise.all([running, complete]);

  assert.deepEqual(badgeText, ['1/3', 'DONE']);
});

test('clears the DONE badge after three seconds', async () => {
  const action = createActionSpy();
  let clearBadge;
  let scheduledDelay;
  const timer = {
    set: (callback, delay) => {
      clearBadge = callback;
      scheduledDelay = delay;
      return 1;
    },
    clear: () => {},
  };

  await queueAutoPreparationToolbarIndicator({ status: 'complete' }, action, timer);
  await Promise.resolve();
  assert.equal(scheduledDelay, DONE_BADGE_DURATION_MS);

  await clearBadge();

  assert.deepEqual(action.calls.slice(-2), [
    ['setBadgeText', { text: '' }],
    ['setTitle', { title: 'TabSort' }],
  ]);
});

test('a new run cancels the pending DONE clear', async () => {
  const action = createActionSpy();
  let clearBadge;
  let cancelledTimerId;
  const timer = {
    set: callback => {
      clearBadge = callback;
      return 7;
    },
    clear: id => { cancelledTimerId = id; },
  };

  await queueAutoPreparationToolbarIndicator({ status: 'complete' }, action, timer);
  await Promise.resolve();
  await queueAutoPreparationToolbarIndicator({
    status: 'running', total: 4, completed: 1, currentTabId: 2,
  }, action, timer);
  await clearBadge();

  assert.equal(cancelledTimerId, 7);
  assert.deepEqual(action.calls.slice(-3), [
    ['setBadgeText', { text: '2/4' }],
    ['setTitle', { title: 'TabSort — Auto-preparing tabs 2/4' }],
    ['setBadgeBackgroundColor', { color: '#1a73e8' }],
  ]);
});
