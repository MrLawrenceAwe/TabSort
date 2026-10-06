export function createAutoPreparationState() {
  return { status: 'idle', total: 0, completed: 0, ready: 0, skipped: 0, currentTabId: null };
}

// The runner is the sole writer; consumers read defensive snapshots.
export const autoPreparationState = createAutoPreparationState();
export const getAutoPreparation = () => ({ ...autoPreparationState });
let progressWindowId = null;
export const getProgressWindowId = () => progressWindowId;
export const setProgressWindowId = id => { progressWindowId = id; };

let preparingTabRecord = null;
let placeholderVideoTabId = null;
export function setPreparingTabRecord(record) {
  preparingTabRecord = record;
  // The placeholder URL keeps the ID from the start of the transfer, even
  // if Chrome replaces the video tab while it is being loaded.
  placeholderVideoTabId = record?.id ?? null;
}
export function projectPreparationPlaceholder(tab) {
  if (!preparingTabRecord) return null;
  const placeholderUrl = chrome.runtime.getURL('preparation/placeholder.html');
  let url;
  try { url = new URL(tab.url); } catch { return null; }
  const tabId = Number(url.searchParams.get('tabId'));
  url.search = '';
  url.hash = '';
  if (url.href !== placeholderUrl || tabId !== placeholderVideoTabId) return null;
  return { ...preparingTabRecord, windowId: tab.windowId, index: tab.index,
    autoPreparationInProgress: true };
}
