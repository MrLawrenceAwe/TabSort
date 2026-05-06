import { isFiniteNumber, isValidWindowId } from '../shared/guards.js';
import { logDebug } from '../shared/log.js';
import { buildTabSnapshot } from './tab-snapshot.js';
import { markTabRecordReloading } from './tab-record-mutations.js';
import { recomputeSortState } from './sort-state.js';
import { listTabIds, trackedWindowState, setWindowId } from './tracked-window-store.js';
import { refreshTabPlaybackState } from './tab-playback-sync.js';
import { syncWindowTabRecords } from './tab-record-sync.js';
import { reorderWindowTabs } from './tab-reorder.js';

export function getTrackedWindowOptions(windowId) {
  return isValidWindowId(windowId) ? { force: true } : undefined;
}

export async function activateTab(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) return;
  if (isValidWindowId(message.windowId)) {
    setWindowId(message.windowId, { force: true });
  }
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch (error) {
    logDebug(`tabs.update failed for ${tabId}`, error);
  }
}

export async function reloadTab(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) return;
  if (isValidWindowId(message.windowId)) {
    setWindowId(message.windowId, { force: true });
  }
  let didReload = false;
  try {
    await chrome.tabs.reload(tabId);
    didReload = true;
  } catch (error) {
    logDebug(`tabs.reload failed for ${tabId}`, error);
  }
  if (!didReload) return;
  const record = trackedWindowState.tabRecordsById[tabId];
  if (!record) return;

  markTabRecordReloading(record);
  recomputeSortState();
}

export async function syncWindowTabs(message) {
  await syncWindowTabRecords(message.windowId, getTrackedWindowOptions(message.windowId));
}

export async function getWindowSnapshot(message) {
  await syncWindowTabRecords(message.windowId, getTrackedWindowOptions(message.windowId));
  const ids = listTabIds();
  await Promise.all(ids.map(refreshTabPlaybackState));
  return buildTabSnapshot();
}

export async function applyTabSortOrder(message) {
  const targetWindowId = isValidWindowId(message.windowId)
    ? message.windowId
    : trackedWindowState.windowId;
  if (isValidWindowId(targetWindowId)) {
    setWindowId(targetWindowId, { force: true });
  }
  await reorderWindowTabs(targetWindowId);
  await syncWindowTabRecords(targetWindowId, getTrackedWindowOptions(targetWindowId));
}
