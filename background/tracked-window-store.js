import { cloneSortSummary, createEmptySortSummary } from '../shared/sort-summary.js';
import { isValidWindowId } from '../shared/guards.js';

function createTrackedWindowStateShape() {
  return {
    tabRecordsById: {},
    targetSortableTabIds: [],
    visibleTabIds: [],
    currentOrderMatchesTarget: false,
    sortSummary: createEmptySortSummary(),
    windowId: null,
    snapshotSignature: null,
    syncToken: 0,
  };
}

export const trackedWindowState = createTrackedWindowStateShape();

export const getCurrentTimeMs = () => Date.now();

export function resetTrackedWindowState({ windowId = null } = {}) {
  const nextState = createTrackedWindowStateShape();
  nextState.windowId = isValidWindowId(windowId) ? windowId : null;
  Object.assign(trackedWindowState, nextState);
  return trackedWindowState;
}

export function replaceTabRecords(tabRecordsById = {}) {
  trackedWindowState.tabRecordsById = tabRecordsById;
  return trackedWindowState.tabRecordsById;
}

export function writeTabRecord(tabId, record) {
  if (typeof tabId !== 'number' || !record) return null;
  trackedWindowState.tabRecordsById[tabId] = record;
  return trackedWindowState.tabRecordsById[tabId];
}

export function listTabIds() {
  return Object.keys(trackedWindowState.tabRecordsById).map(Number);
}

export function readTabRecord(tabId) {
  return trackedWindowState.tabRecordsById[tabId];
}

export function removeTabRecordFromState(tabId) {
  if (!trackedWindowState.tabRecordsById[tabId]) return false;
  delete trackedWindowState.tabRecordsById[tabId];
  return true;
}

export function setSnapshotSignature(signature = null) {
  trackedWindowState.snapshotSignature = signature;
  return trackedWindowState.snapshotSignature;
}

export function beginSync() {
  trackedWindowState.syncToken += 1;
  return trackedWindowState.syncToken;
}

export function isSyncCurrent(syncToken) {
  return syncToken === trackedWindowState.syncToken;
}

export function applySortState({
  visibleTabIds = [],
  targetSortableTabIds = [],
  currentOrderMatchesTarget = false,
  sortSummary = createEmptySortSummary(),
} = {}) {
  trackedWindowState.targetSortableTabIds = [...targetSortableTabIds];
  trackedWindowState.visibleTabIds = [...visibleTabIds];
  trackedWindowState.currentOrderMatchesTarget = Boolean(currentOrderMatchesTarget);
  trackedWindowState.sortSummary = cloneSortSummary(sortSummary);
}

export function setWindowId(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(trackedWindowState.windowId)) {
      trackedWindowState.windowId = windowId;
    }
  } else if (force && windowId == null) {
    trackedWindowState.windowId = null;
  }
  return isValidWindowId(trackedWindowState.windowId) ? trackedWindowState.windowId : null;
}

export function canManageWindow(windowId) {
  return trackedWindowState.windowId == null || windowId === trackedWindowState.windowId;
}
