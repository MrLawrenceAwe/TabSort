import { cloneSortSummary, createEmptySortSummary } from '../shared/sort-summary.js';
import { isValidWindowId } from '../shared/guards.js';

function createManagedStateShape() {
  return {
    tabRecordsById: {},
    targetOrder: [],
    visibleOrder: [],
    allSortableTabsSorted: false,
    sortSummary: createEmptySortSummary(),
    managedWindowId: null,
    snapshotSignature: null,
    syncToken: 0,
  };
}

export const managedState = createManagedStateShape();

export const now = () => Date.now();

export function resetManagedState({ managedWindowId = null } = {}) {
  const nextState = createManagedStateShape();
  nextState.managedWindowId = isValidWindowId(managedWindowId) ? managedWindowId : null;
  Object.assign(managedState, nextState);
  return managedState;
}

export function replaceTabRecords(tabRecordsById = {}) {
  managedState.tabRecordsById = tabRecordsById;
  return managedState.tabRecordsById;
}

export function writeManagedTabRecord(tabId, record) {
  if (typeof tabId !== 'number' || !record) return null;
  managedState.tabRecordsById[tabId] = record;
  return managedState.tabRecordsById[tabId];
}

export function listManagedTabIds() {
  return Object.keys(managedState.tabRecordsById).map(Number);
}

export function readManagedTabRecord(tabId) {
  return managedState.tabRecordsById[tabId];
}

export function removeManagedTabRecord(tabId) {
  if (!managedState.tabRecordsById[tabId]) return false;
  delete managedState.tabRecordsById[tabId];
  return true;
}

export function assignManagedSnapshotSignature(signature = null) {
  managedState.snapshotSignature = signature;
  return managedState.snapshotSignature;
}

export function beginManagedSync() {
  managedState.syncToken += 1;
  return managedState.syncToken;
}

export function isManagedSyncCurrent(syncToken) {
  return syncToken === managedState.syncToken;
}

export function applyManagedSortState({
  visibleOrder = [],
  targetOrder = [],
  allSortableTabsSorted = false,
  sortSummary = createEmptySortSummary(),
} = {}) {
  managedState.targetOrder = [...targetOrder];
  managedState.visibleOrder = [...visibleOrder];
  managedState.allSortableTabsSorted = Boolean(allSortableTabsSorted);
  managedState.sortSummary = cloneSortSummary(sortSummary);
}

export function setManagedWindowId(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(managedState.managedWindowId)) {
      managedState.managedWindowId = windowId;
    }
  } else if (force && windowId == null) {
    managedState.managedWindowId = null;
  }
  return isValidWindowId(managedState.managedWindowId) ? managedState.managedWindowId : null;
}

export function canManageWindow(windowId) {
  return managedState.managedWindowId == null || windowId === managedState.managedWindowId;
}
