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

  assert.deepEqual(queries, [{ lastFocusedWindow: true }]);
});

test('listWindowTabs keeps explicit window ids when one is provided', async () => {
  const queries = [];

  globalThis.chrome.tabs.query = (query, callback) => {
    queries.push(query);
    callback([]);
  };

  await listWindowTabs(9);

  assert.deepEqual(queries, [{ windowId: 9 }]);
});

test('listWindowTabs returns null when a Chrome query fails', async () => {
  globalThis.chrome.tabs.query = (_query, callback) => {
    globalThis.chrome.runtime.lastError = new Error('query failed');
    callback([]);
    globalThis.chrome.runtime.lastError = null;
  };

  const tabs = await listWindowTabs(9);

  assert.equal(tabs, null);
});

test('listWindowTabs filters out malformed tab entries from Chrome results', async () => {
  globalThis.chrome.tabs.query = (_query, callback) => {
    callback([
      { id: 1, windowId: 9, url: 'https://www.youtube.com/watch?v=1' },
      { windowId: 9, url: 'https://www.youtube.com/watch?v=missing-id' },
      null,
      { id: 2, windowId: 9, url: 'https://www.youtube.com/watch?v=2' },
    ]);
    globalThis.chrome.runtime.lastError = null;
  };

  const tabs = await listWindowTabs(9);

  assert.deepEqual(tabs, [
    { id: 1, windowId: 9, url: 'https://www.youtube.com/watch?v=1' },
    { id: 2, windowId: 9, url: 'https://www.youtube.com/watch?v=2' },
  ]);
});
