import { cloneSortSummary, createEmptySortSummary } from '../shared/sort-summary.js';
import { isValidWindowId } from '../shared/guards.js';
import {
  createFreshTrackedWindowStoreState,
  readonlyTrackedWindowState,
  mutableTrackedWindowState,
} from './window-store.js';
import { getTrackedWindowId } from './window-store-selectors.js';

export function resetWindowStore({ windowId = null } = {}) {
  const nextState = createFreshTrackedWindowStoreState();
  nextState.windowId = isValidWindowId(windowId) ? windowId : null;
  Object.assign(mutableTrackedWindowState, nextState);
  return readonlyTrackedWindowState;
}

export function replaceAllTabRecords(tabRecordsById = {}) {
  mutableTrackedWindowState.tabRecordsById = { ...tabRecordsById };
  return mutableTrackedWindowState.tabRecordsById;
}

export function getMutableTabRecord(tabId) {
  return mutableTrackedWindowState.tabRecordsById[tabId] || null;
}

export function setTabRecord(tabId, record) {
  if (typeof tabId !== 'number' || !record) return null;
  mutableTrackedWindowState.tabRecordsById[tabId] = record;
  return mutableTrackedWindowState.tabRecordsById[tabId];
}

export function removeTabRecordFromStore(tabId) {
  if (!mutableTrackedWindowState.tabRecordsById[tabId]) return false;
  delete mutableTrackedWindowState.tabRecordsById[tabId];
  return true;
}

export function setSnapshotSignature(signature = null) {
  mutableTrackedWindowState.snapshotSignature = signature;
  return mutableTrackedWindowState.snapshotSignature;
}

export function nextSyncToken() {
  mutableTrackedWindowState.syncToken += 1;
  return mutableTrackedWindowState.syncToken;
}

export function isSyncTokenCurrent(syncToken) {
  return syncToken === mutableTrackedWindowState.syncToken;
}

export function setSortState({
  visibleTabIds = [],
  targetSortableTabIds = [],
  currentOrderMatchesTarget = false,
  sortSummary = createEmptySortSummary(),
} = {}) {
  mutableTrackedWindowState.targetSortableTabIds = [...targetSortableTabIds];
  mutableTrackedWindowState.visibleTabIds = [...visibleTabIds];
  mutableTrackedWindowState.currentOrderMatchesTarget = Boolean(currentOrderMatchesTarget);
  mutableTrackedWindowState.sortSummary = cloneSortSummary(sortSummary);
}

export function setTrackedWindowId(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(mutableTrackedWindowState.windowId)) {
      mutableTrackedWindowState.windowId = windowId;
    }
  } else if (force && windowId == null) {
    mutableTrackedWindowState.windowId = null;
  }
  return getTrackedWindowId();
}
