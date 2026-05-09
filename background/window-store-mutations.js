import { cloneSortSummary, createEmptySortSummary } from '../shared/sort-summary.js';
import { isValidWindowId } from '../shared/guards.js';
import {
  createFreshTrackedWindowStoreState,
  trackedWindowState,
  trackedWindowStoreState,
} from './window-store.js';
import { getTrackedWindowId } from './window-store-selectors.js';

export function resetWindowStore({ windowId = null } = {}) {
  const nextState = createFreshTrackedWindowStoreState();
  nextState.windowId = isValidWindowId(windowId) ? windowId : null;
  Object.assign(trackedWindowStoreState, nextState);
  return trackedWindowState;
}

export function replaceAllTabRecords(tabRecordsById = {}) {
  trackedWindowStoreState.tabRecordsById = { ...tabRecordsById };
  return trackedWindowStoreState.tabRecordsById;
}

export function setTabRecord(tabId, record) {
  if (typeof tabId !== 'number' || !record) return null;
  trackedWindowStoreState.tabRecordsById[tabId] = record;
  return trackedWindowStoreState.tabRecordsById[tabId];
}

export function removeTabRecordFromStore(tabId) {
  if (!trackedWindowStoreState.tabRecordsById[tabId]) return false;
  delete trackedWindowStoreState.tabRecordsById[tabId];
  return true;
}

export function setSnapshotSignature(signature = null) {
  trackedWindowStoreState.snapshotSignature = signature;
  return trackedWindowStoreState.snapshotSignature;
}

export function nextSyncToken() {
  trackedWindowStoreState.syncToken += 1;
  return trackedWindowStoreState.syncToken;
}

export function isSyncTokenCurrent(syncToken) {
  return syncToken === trackedWindowStoreState.syncToken;
}

export function setSortState({
  visibleTabIds = [],
  targetSortableTabIds = [],
  currentOrderMatchesTarget = false,
  sortSummary = createEmptySortSummary(),
} = {}) {
  trackedWindowStoreState.targetSortableTabIds = [...targetSortableTabIds];
  trackedWindowStoreState.visibleTabIds = [...visibleTabIds];
  trackedWindowStoreState.currentOrderMatchesTarget = Boolean(currentOrderMatchesTarget);
  trackedWindowStoreState.sortSummary = cloneSortSummary(sortSummary);
}

export function setTrackedWindowId(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(trackedWindowStoreState.windowId)) {
      trackedWindowStoreState.windowId = windowId;
    }
  } else if (force && windowId == null) {
    trackedWindowStoreState.windowId = null;
  }
  return getTrackedWindowId();
}
