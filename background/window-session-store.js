import { cloneSortSummary, createEmptySortSummary } from '../shared/sort-summary.js';
import { isValidWindowId } from '../shared/guards.js';
import { createWindowSessionStateShape, windowSessionState } from './window-session-state.js';

export const getCurrentTimeMs = () => Date.now();

export function resetWindowSessionState({ windowId = null } = {}) {
  const nextState = createWindowSessionStateShape();
  nextState.windowId = isValidWindowId(windowId) ? windowId : null;
  Object.assign(windowSessionState, nextState);
  return windowSessionState;
}

export function replaceTabRecords(tabRecordsById = {}) {
  windowSessionState.tabRecordsById = tabRecordsById;
  return windowSessionState.tabRecordsById;
}

export function writeTabRecord(tabId, record) {
  if (typeof tabId !== 'number' || !record) return null;
  windowSessionState.tabRecordsById[tabId] = record;
  return windowSessionState.tabRecordsById[tabId];
}

export function listTabIds() {
  return Object.keys(windowSessionState.tabRecordsById).map(Number);
}

export function readTabRecord(tabId) {
  return windowSessionState.tabRecordsById[tabId];
}

export function removeTabRecordFromState(tabId) {
  if (!windowSessionState.tabRecordsById[tabId]) return false;
  delete windowSessionState.tabRecordsById[tabId];
  return true;
}

export function setSnapshotSignature(signature = null) {
  windowSessionState.snapshotSignature = signature;
  return windowSessionState.snapshotSignature;
}

export function beginSync() {
  windowSessionState.syncToken += 1;
  return windowSessionState.syncToken;
}

export function isSyncCurrent(syncToken) {
  return syncToken === windowSessionState.syncToken;
}

export function applySortState({
  visibleTabIds = [],
  targetSortableTabIds = [],
  currentOrderMatchesTarget = false,
  sortSummary = createEmptySortSummary(),
} = {}) {
  windowSessionState.targetSortableTabIds = [...targetSortableTabIds];
  windowSessionState.visibleTabIds = [...visibleTabIds];
  windowSessionState.currentOrderMatchesTarget = Boolean(currentOrderMatchesTarget);
  windowSessionState.sortSummary = cloneSortSummary(sortSummary);
}

export function setWindowId(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(windowSessionState.windowId)) {
      windowSessionState.windowId = windowId;
    }
  } else if (force && windowId == null) {
    windowSessionState.windowId = null;
  }
  return isValidWindowId(windowSessionState.windowId) ? windowSessionState.windowId : null;
}

export function canManageWindow(windowId) {
  return windowSessionState.windowId == null || windowId === windowSessionState.windowId;
}
