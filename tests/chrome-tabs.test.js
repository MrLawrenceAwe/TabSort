import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeScriptInTab,
  listWindowTabs,
  MESSAGE_FAILURE_REASONS,
  sendMessageToTab,
} from '../background/tabs/chrome-tabs.js';
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

test('sendMessageToTab classifies missing content-script receivers', async () => {
  globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
    globalThis.chrome.runtime.lastError = new Error('Could not establish connection. Receiving end does not exist.');
    callback();
    globalThis.chrome.runtime.lastError = null;
  };

  const result = await sendMessageToTab(1, { type: 'collectVideoMetrics' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, MESSAGE_FAILURE_REASONS.NO_RECEIVER);
});

test('executeScriptInTab reports successful Chrome scripting injection', async () => {
  const calls = [];
  globalThis.chrome.scripting = {
    executeScript(options, callback) {
      calls.push(options);
      callback();
    },
  };

  const result = await executeScriptInTab(7, ['../content/youtube/page/bootstrap.js']);

  assert.deepEqual(calls, [
    {
      target: { tabId: 7 },
      files: ['../content/youtube/page/bootstrap.js'],
    },
  ]);
  assert.equal(result.ok, true);
});
