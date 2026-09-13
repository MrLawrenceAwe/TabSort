import assert from 'node:assert/strict';
import test from 'node:test';

import { startAutoPreparation } from '../../background/auto-preparation/service.js';
import { getProgressWindowId } from '../../background/auto-preparation/state.js';
import { resetTrackedWindowStore } from '../../background/windows/store.js';
import {
  createChromeTabFixture,
  ensureChromeApi,
} from '../helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test('startAutoPreparation closes the progress window if its target window changes during setup', { concurrency: false }, async () => {
  resetTrackedWindowStore({ windowId: 1 });
  globalThis.chrome.storage = { session: { get: async () => ({}) } };
  globalThis.chrome.runtime.getURL = path => `chrome-extension://test/${path}`;
  globalThis.chrome.tabs.query = async () => [
    createChromeTabFixture(1, { windowId: 1, active: true }),
  ];
  const removedWindowIds = [];
  globalThis.chrome.windows = {
    create: async () => {
      resetTrackedWindowStore({ windowId: 2 });
      return { id: 99 };
    },
    remove: async windowId => { removedWindowIds.push(windowId); },
  };

  await assert.rejects(startAutoPreparation({ windowId: 1 }), {
    message: 'Stopped because the tracked window changed',
  });

  assert.deepEqual(removedWindowIds, [99]);
  assert.equal(getProgressWindowId(), null);
});
