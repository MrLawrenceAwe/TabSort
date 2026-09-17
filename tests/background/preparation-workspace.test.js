import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreparationWorkspace } from '../../background/auto-preparation/workspace.js';

function harness() {
  const saved = {};
  let nextId = 10;
  const tabs = new Map([
    [1, { id: 1, windowId: 1, index: 0, active: true, url: 'https://example.com', groupId: -1 }],
    [2, { id: 2, windowId: 1, index: 1, active: false, url: 'https://www.youtube.com/watch?v=test', groupId: 7 }],
  ]);
  const calls = [];
  globalThis.chrome = {
    runtime: { getURL: path => `chrome-extension://test/${path}` },
    storage: { session: {
      get: async key => ({ [key]: structuredClone(saved[key]) }),
      set: async values => Object.assign(saved, structuredClone(values)),
      remove: async key => { delete saved[key]; },
    } },
    windows: {
      get: async id => ({ id }),
      create: async options => {
        calls.push(['window', options]);
        tabs.set(9, { id: 9, windowId: 3, index: 0, url: options.url, active: true });
        return { id: 3, tabs: [tabs.get(9)] };
      },
    },
    tabs: {
      get: async id => { if (!tabs.has(id)) throw new Error('No tab'); return { ...tabs.get(id) }; },
      create: async options => {
        const tab = { id: nextId++, groupId: -1, index: tabs.size, ...options };
        tabs.set(tab.id, tab);
        return { ...tab };
      },
      move: async (id, options) => {
        calls.push(['move', id, options]);
        assert.ok(saved.autoPreparationWorkspace.transfer, 'journal exists before moving');
        const tab = tabs.get(id);
        const crossingWindows = options.windowId != null && options.windowId !== tab.windowId;
        Object.assign(tab, options, crossingWindows ? { active: false, groupId: -1 } : {});
        if (tab.index === -1) tab.index = Math.max(...[...tabs.values()].map(item => item.index)) + 1;
      },
      ungroup: async id => { calls.push(['ungroup', id]); tabs.get(id).groupId = -1; },
      update: async (id, options) => { calls.push(['update', id, options]); Object.assign(tabs.get(id), options); },
      reload: async id => { calls.push(['reload', id]); Object.assign(tabs.get(id), { discarded: false, status: 'loading' }); },
      group: async ({ tabIds, groupId }) => { tabs.get(tabIds).groupId = groupId; },
      remove: async id => { tabs.delete(id); },
      query: async ({ windowId }) => [...tabs.values()]
        .filter(tab => windowId == null || tab.windowId === windowId)
        .map(tab => ({ ...tab })),
    },
  };
  return { workspace: createPreparationWorkspace(), tabs, saved, calls };
}

test('moves only the video and restores its placeholder position/group without activating it', async () => {
  const h = harness();
  await h.workspace.create(1);
  await h.workspace.visit(2, 1);
  assert.equal(h.tabs.get(2).windowId, 3);
  assert.equal(h.tabs.get(1).active, true);
  const placeholder = h.tabs.get(h.workspace.transfer.placeholderId);
  assert.equal(placeholder.groupId, 7);
  placeholder.index = 4; // User rearranges tabs while preparation is running.
  await h.workspace.returnTab();
  assert.equal(h.tabs.get(2).windowId, 1);
  assert.equal(h.tabs.get(2).index, 4);
  assert.equal(h.tabs.get(2).groupId, 7);
  assert.equal(h.tabs.get(2).active, false);
  assert.equal(h.tabs.has(placeholder.id), false);
  assert.equal(h.calls[0][1].focused, false);
});

test('never moves the current browsing tab', async () => {
  const h = harness();
  await h.workspace.create(1);
  assert.equal(await h.workspace.visit(1, 1), false);
  assert.equal(h.workspace.transfer, null);
});

test('a worker restart returns a journaled tab and removes its stale progress page and placeholder', async () => {
  const h = harness();
  await h.workspace.create(1);
  await h.workspace.visit(2, 1);
  const placeholderId = h.workspace.transfer.placeholderId;
  h.tabs.set(30, { id: 30, windowId: 3, index: 1, url: 'https://example.com', active: false });
  await createPreparationWorkspace().recover();
  assert.equal(h.tabs.get(2).windowId, 1);
  assert.equal(h.tabs.has(placeholderId), false);
  assert.equal(h.tabs.has(9), false);
  assert.equal(h.tabs.has(30), true);
  assert.equal(h.saved.autoPreparationWorkspace, undefined);
});

test('closing the original window leaves the real video in preparation and clears the journal', async () => {
  const h = harness();
  await h.workspace.create(1);
  await h.workspace.visit(2, 1);
  h.tabs.delete(h.workspace.transfer.placeholderId);
  chrome.windows.get = async () => { throw new Error('No window'); };
  await h.workspace.close();
  assert.equal(h.tabs.get(2).windowId, 3);
  assert.equal(h.saved.autoPreparationWorkspace, undefined);
  assert.equal(h.workspace.transfer, null);
});

test('closing the preparation video preserves a placeholder with the original URL', async () => {
  const h = harness();
  await h.workspace.create(1);
  await h.workspace.visit(2, 1);
  const placeholderId = h.workspace.transfer.placeholderId;
  h.tabs.delete(2);
  await h.workspace.close();
  assert.equal(new URL(h.tabs.get(placeholderId).url).searchParams.get('url'), 'https://www.youtube.com/watch?v=test');
});

test('a tab moved elsewhere by the user is left there', async () => {
  const h = harness();
  await h.workspace.create(1);
  await h.workspace.visit(2, 1);
  h.tabs.get(2).windowId = 5;
  await h.workspace.close();
  assert.equal(h.tabs.get(2).windowId, 5);
});


test('Chrome tab replacement updates the recovery journal and returns the replacement', async () => {
  const h = harness();
  await h.workspace.create(1);
  await h.workspace.visit(2, 1);
  h.tabs.set(22, { ...h.tabs.get(2), id: 22 });
  h.tabs.delete(2);
  await h.workspace.replaceTabId(22, 2);
  assert.equal(h.saved.autoPreparationWorkspace.transfer.tabId, 22);
  await createPreparationWorkspace().recover();
  assert.equal(h.tabs.get(22).windowId, 1);
  assert.equal(h.tabs.get(22).groupId, 7);
});

test('sleeping grouped tabs are explicitly ungrouped before crossing windows', async () => {
  const h = harness();
  h.tabs.get(2).discarded = true;
  const move = chrome.tabs.move;
  chrome.tabs.move = async (id, options) => {
    if (options.windowId != null && options.windowId !== h.tabs.get(id).windowId) {
      assert.equal(h.tabs.get(id).groupId, -1, 'cross-window moves must start ungrouped');
    }
    return move(id, options);
  };
  await h.workspace.create(1);
  await h.workspace.visit(2, 1);
  assert.ok(h.calls.some(call => call[0] === 'ungroup' && call[1] === 2));
  assert.equal(h.tabs.get(2).discarded, false);
  const wakeIndex = h.calls.findIndex(call => call[0] === 'reload' && call[1] === 2);
  const activateIndex = h.calls.findIndex(call => call[0] === 'update' && call[1] === 2);
  assert.ok(wakeIndex >= 0 && wakeIndex < activateIndex);
  await h.workspace.returnTab();
  assert.equal(h.tabs.get(2).groupId, 7);
});

test('loaded videos are never reloaded during preparation', async () => {
  const h = harness();
  await h.workspace.create(1);
  await h.workspace.visit(2, 1);
  assert.equal(h.calls.some(call => call[0] === 'reload'), false);
});

test('failed wake still allows restoration of the sleeping video', async () => {
  const h = harness();
  h.tabs.get(2).discarded = true;
  chrome.tabs.reload = async () => { throw new Error('reload failed'); };
  await h.workspace.create(1);
  await assert.rejects(h.workspace.visit(2, 1), /Waking sleeping video: reload failed/);
  await h.workspace.close();
  assert.equal(h.tabs.get(2).windowId, 1);
  assert.equal(h.tabs.get(2).groupId, 7);
  assert.equal(h.tabs.get(2).discarded, true);
});

test('failed outward moves restore the video to the source group', async () => {
  const h = harness();
  const move = chrome.tabs.move;
  chrome.tabs.move = async (id, options) => {
    if (id === 2 && options.windowId === 3) throw new Error('group continuity');
    return move(id, options);
  };
  await h.workspace.create(1);
  await assert.rejects(h.workspace.visit(2, 1), /Moving video to preparation window: group continuity/);
  assert.equal(h.tabs.get(2).groupId, -1);
  await h.workspace.close();
  assert.equal(h.tabs.get(2).windowId, 1);
  assert.equal(h.tabs.get(2).groupId, 7);
  assert.equal(h.saved.autoPreparationWorkspace, undefined);
});

test('a failed group restoration can be retried after the video has already returned', async () => {
  const h = harness();
  await h.workspace.create(1);
  await h.workspace.visit(2, 1);
  const group = chrome.tabs.group;
  chrome.tabs.group = async () => { throw new Error('temporary group failure'); };
  await assert.rejects(h.workspace.returnTab(), /Restoring video group: temporary group failure/);
  assert.equal(h.tabs.get(2).windowId, 1);
  assert.ok(h.workspace.transfer);
  chrome.tabs.group = group;
  await createPreparationWorkspace().recover();
  assert.equal(h.tabs.get(2).groupId, 7);
  assert.equal(h.saved.autoPreparationWorkspace, undefined);
});
