import assert from 'node:assert/strict';
import test from 'node:test';

import {
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

test('clears the completion badge while auto-preparation is running or stopped', async () => {
  const action = createActionSpy();

  await updateAutoPreparationToolbarIndicator({ status: 'running' }, action);
  await updateAutoPreparationToolbarIndicator({ status: 'stopped' }, action);

  assert.deepEqual(action.calls, [
    ['setBadgeText', { text: '' }],
    ['setTitle', { title: 'TabSort' }],
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
      if (text !== '') return Promise.resolve();
      signalRunningUpdate();
      return new Promise(resolve => { releaseRunningUpdate = resolve; });
    },
    setBadgeBackgroundColor: async () => {},
    setTitle: async () => {},
  };

  const running = queueAutoPreparationToolbarIndicator({ status: 'running' }, action);
  await runningUpdateStarted;
  const complete = queueAutoPreparationToolbarIndicator({ status: 'complete' }, action);
  releaseRunningUpdate();
  await Promise.all([running, complete]);

  assert.deepEqual(badgeText, ['', 'DONE']);
});
