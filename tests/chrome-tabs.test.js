import assert from 'node:assert/strict';
import test from 'node:test';

import { listWindowTabs } from '../background/chrome-tabs.js';
import { ensureChromeApi } from './helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test('listWindowTabs uses the last focused window when no explicit id is provided', async () => {
  const queries = [];

  globalThis.chrome.tabs.query = (query, callback) => {
    queries.push(query);
    callback([]);
  };

  await listWindowTabs();

  assert.deepEqual(queries, [
    { lastFocusedWindow: true },
    { lastFocusedWindow: true, hidden: true },
  ]);
});

test('listWindowTabs keeps explicit window ids when one is provided', async () => {
  const queries = [];

  globalThis.chrome.tabs.query = (query, callback) => {
    queries.push(query);
    callback([]);
  };

  await listWindowTabs(9);

  assert.deepEqual(queries, [
    { windowId: 9 },
    { windowId: 9, hidden: true },
  ]);
});

test('listWindowTabs returns null when a Chrome query fails', async () => {
  globalThis.chrome.tabs.query = (query, callback) => {
    globalThis.chrome.runtime.lastError =
      query.hidden === true ? new Error('hidden query failed') : null;
    callback([]);
    globalThis.chrome.runtime.lastError = null;
  };

  const tabs = await listWindowTabs(9);

  assert.equal(tabs, null);
});
