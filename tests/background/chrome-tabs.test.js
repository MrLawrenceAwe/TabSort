import assert from 'node:assert/strict';
import test from 'node:test';

import {
  discardTab,
  executeScriptInTab,
  listWindowTabs,
  MESSAGE_FAILURE_REASONS,
  sendMessageToTab,
} from '../../background/tabs/chrome-tabs.js';
import { ensureChromeApi } from '../helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test('discardTab returns a sleeping tab to Chrome successfully', async () => {
  globalThis.chrome.tabs.discard = async tabId => ({ id: tabId, discarded: true });

  assert.equal(await discardTab(7), true);
});

test('discardTab reports Chrome failures without throwing', async () => {
  globalThis.chrome.tabs.discard = async () => { throw new Error('cannot discard active tab'); };

  assert.equal(await discardTab(7), false);
});

test('listWindowTabs uses the last focused window when no explicit id is provided', async () => {
  const queries = [];

  globalThis.chrome.tabs.query = async (query) => {
    queries.push(query);
    return [];
  };

  await listWindowTabs();

  assert.deepEqual(queries, [{ lastFocusedWindow: true }]);
});

test('listWindowTabs keeps explicit window ids when one is provided', async () => {
  const queries = [];

  globalThis.chrome.tabs.query = async (query) => {
    queries.push(query);
    return [];
  };

  await listWindowTabs(9);

  assert.deepEqual(queries, [{ windowId: 9 }]);
});

test('listWindowTabs returns null when a Chrome query fails', async () => {
  globalThis.chrome.tabs.query = async () => { throw new Error('query failed'); };

  const tabs = await listWindowTabs(9);

  assert.equal(tabs, null);
});

test('listWindowTabs filters out malformed tab entries from Chrome results', async () => {
  globalThis.chrome.tabs.query = async () => [
      { id: 1, windowId: 9, url: 'https://www.youtube.com/watch?v=1' },
      { windowId: 9, url: 'https://www.youtube.com/watch?v=missing-id' },
      null,
      { id: 2, windowId: 9, url: 'https://www.youtube.com/watch?v=2' },
    ];

  const tabs = await listWindowTabs(9);

  assert.deepEqual(tabs, [
    { id: 1, windowId: 9, url: 'https://www.youtube.com/watch?v=1' },
    { id: 2, windowId: 9, url: 'https://www.youtube.com/watch?v=2' },
  ]);
});

test('sendMessageToTab classifies missing content-script receivers', async () => {
  globalThis.chrome.tabs.sendMessage = async () => {
    throw new Error('Could not establish connection. Receiving end does not exist.');
  };

  const result = await sendMessageToTab(1, { type: 'collectVideoMetrics' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, MESSAGE_FAILURE_REASONS.NO_RECEIVER);
});

test('executeScriptInTab reports successful Chrome scripting injection', async () => {
  const calls = [];
  globalThis.chrome.scripting = {
    async executeScript(options) {
      calls.push(options);
    },
  };

  const result = await executeScriptInTab(7, ['../../content/youtube/page/bootstrap.js']);

  assert.deepEqual(calls, [
    {
      target: { tabId: 7 },
      files: ['../../content/youtube/page/bootstrap.js'],
    },
  ]);
  assert.equal(result.ok, true);
});
