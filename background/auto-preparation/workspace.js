import { getTab } from '../tabs/chrome-tabs.js';

const JOURNAL_KEY = 'autoPreparationWorkspace';

// A placeholder keeps both the position and even a one-tab group alive. The
// journal is written before moving a real tab so a worker restart can return it.
export function createPreparationWorkspace() {
  let workspace = null;
  const persist = () => chrome.storage.session.set({ [JOURNAL_KEY]: workspace });
  async function step(label, action) {
    try { return await action(); } catch (error) {
      throw new Error(`${label}: ${error?.message || error}`, { cause: error });
    }
  }
  const readTab = async id => { try { return await getTab(id); } catch { return null; } };
  const isPlaceholder = tab => tab?.url?.startsWith(chrome.runtime.getURL('preparation-progress/placeholder.html'));

  async function returnTab() {
    const transfer = workspace?.transfer;
    if (!transfer) return null;
    const tab = await readTab(transfer.tabId);
    const placeholder = await readTab(transfer.placeholderId);
    if (!tab) {
      // The user closed the preparation tab/window. Keep its recovery link.
      workspace.transfer = null;
      await persist();
      return null;
    }
    if (tab.windowId === workspace.windowId || tab.windowId === transfer.returnWindowId) {
      const destination = isPlaceholder(placeholder) ? placeholder.windowId : transfer.sourceWindowId;
      try { await chrome.windows.get(destination); } catch {
        throw new Error('Original window closed. Your video is still in the preparation window.');
      }
      const index = isPlaceholder(placeholder) ? placeholder.index : transfer.index;
      // Enter at the end: an ungrouped tab cannot be inserted inside a group.
      transfer.returnWindowId = destination;
      await persist();
      if (tab.windowId !== destination) {
        if (tab.groupId >= 0) await step('Ungrouping video before returning', () => chrome.tabs.ungroup(tab.id));
        await step('Returning video to its window', () => chrome.tabs.move(tab.id, { windowId: destination, index: -1 }));
      }
      if (isPlaceholder(placeholder) && placeholder.groupId >= 0) {
        await step('Restoring video group', () => chrome.tabs.group({ tabIds: tab.id, groupId: placeholder.groupId }));
      }
      const anchor = await readTab(transfer.placeholderId);
      const returned = await getTab(tab.id);
      const targetIndex = isPlaceholder(anchor)
        ? anchor.index - (returned.index < anchor.index ? 1 : 0)
        : index;
      await step('Restoring video position', () => chrome.tabs.move(tab.id, { index: targetIndex }));
      // Do not activate the returned tab: the user's selection stays untouched.
    }
    if (isPlaceholder(placeholder)) await chrome.tabs.remove(placeholder.id);
    workspace.transfer = null;
    await persist();
    return await readTab(tab.id);
  }

  async function close() {
    await returnTab();
    if (!workspace) return;
    workspace = null;
    await chrome.storage.session.remove(JOURNAL_KEY);
  }

  return {
    get windowId() { return workspace?.windowId ?? null; },
    get transfer() { return workspace?.transfer ?? null; },
    async create(sourceWindowId) {
      if (workspace) throw new Error('Return the previous preparation tab before starting again.');
      const source = await chrome.windows.get(sourceWindowId);
      const window = await chrome.windows.create({
        url: chrome.runtime.getURL('preparation-progress/index.html'),
        type: 'normal', focused: false, width: 720, height: 560,
        incognito: Boolean(source.incognito),
      });
      workspace = { windowId: window.id, transfer: null };
      await persist();
      return window.id;
    },
    async visit(tabId, sourceWindowId) {
      const tab = await getTab(tabId);
      if (tab.windowId !== sourceWindowId || tab.active || tab.pinned) return false;
      const url = new URL(chrome.runtime.getURL('preparation-progress/placeholder.html'));
      url.searchParams.set('tabId', String(tab.id));
      url.searchParams.set('url', tab.url);
      const placeholder = await step('Creating placeholder', () => chrome.tabs.create({
        windowId: sourceWindowId, active: false, url: url.href,
      }));
      workspace.transfer = {
        tabId, placeholderId: placeholder.id, sourceWindowId, index: tab.index,
      };
      await persist();
      if (tab.groupId >= 0) await step('Adding placeholder to group', () => chrome.tabs.group({ tabIds: placeholder.id, groupId: tab.groupId }));
      const anchor = await getTab(tabId);
      const placed = await getTab(placeholder.id);
      await step('Positioning placeholder', () => chrome.tabs.move(placeholder.id, { index: anchor.index - (placed.index < anchor.index ? 1 : 0) }));
      // Recheck after creating the placeholder: a tab selected meanwhile belongs
      // to the user and must stay in their window.
      const current = await getTab(tabId);
      if (current.active || current.pinned || current.windowId !== sourceWindowId) return false;
      // Leave the source group explicitly rather than relying on a cross-window
      // move to ungroup the video. The placeholder preserves its group and
      // position while ungroup() moves the video out.
      if (current.groupId >= 0) {
        workspace.transfer.returnWindowId = sourceWindowId;
        await persist();
        await step('Removing video from source group', () => chrome.tabs.ungroup(tabId));
      }
      await step('Moving video to preparation window', () => chrome.tabs.move(tabId, { windowId: workspace.windowId, index: -1 }));
      // Selecting a discarded tab in an unfocused window can leave it unloaded.
      // Start its navigation explicitly before activation instead of spending
      // the whole preparation deadline waiting for a visibility-triggered load.
      const moved = await getTab(tabId);
      if (moved.windowId !== workspace.windowId || moved.url !== current.url) return false;
      if (moved.discarded) {
        await step('Waking sleeping video', () => chrome.tabs.reload(tabId));
      }
      await step('Activating preparation video', () => chrome.tabs.update(tabId, { active: true }));
      return true;
    },
    async replaceTabId(addedTabId, removedTabId) {
      if (workspace?.transfer?.tabId !== removedTabId) return;
      workspace.transfer.tabId = addedTabId;
      await persist();
    },
    returnTab,
    close,
    async recover() {
      const saved = await chrome.storage.session.get(JOURNAL_KEY);
      workspace = saved[JOURNAL_KEY] ?? null;
      if (workspace) await close();
    },
  };
}
