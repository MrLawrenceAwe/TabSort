import { cloneSortSummary, createEmptySortSummary } from '../shared/sort-summary.js';
import { isValidWindowId } from '../shared/guards.js';

export const getCurrentTimeMs = () => Date.now();

export function cloneTabRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    videoDetails: record.videoDetails ? { ...record.videoDetails } : null,
  };
}

export function cloneTabRecordsById(tabRecordsById = {}) {
  return Object.fromEntries(
    Object.entries(tabRecordsById).map(([id, record]) => [id, cloneTabRecord(record)]),
  );
}

function createTrackedWindowStoreState() {
  return {
    tabRecordsById: {},
    targetVideoTabOrder: [],
    trackedTabIdsInWindowOrder: [],
    allEligibleVideosSorted: false,
    sortSummary: createEmptySortSummary(),
    windowId: null,
    snapshotSignature: null,
    syncToken: 0,
  };
}

const trackedWindowState = createTrackedWindowStoreState();

export const trackedWindowStateView = Object.freeze({
  get tabRecordsById() {
    return cloneTabRecordsById(trackedWindowState.tabRecordsById);
  },
  get targetVideoTabOrder() {
    return [...trackedWindowState.targetVideoTabOrder];
  },
  get trackedTabIdsInWindowOrder() {
    return [...trackedWindowState.trackedTabIdsInWindowOrder];
  },
  get allEligibleVideosSorted() {
    return trackedWindowState.allEligibleVideosSorted;
  },
  get sortSummary() {
    return cloneSortSummary(trackedWindowState.sortSummary);
  },
  get windowId() {
    return trackedWindowState.windowId;
  },
  get snapshotSignature() {
    return trackedWindowState.snapshotSignature;
  },
  get syncToken() {
    return trackedWindowState.syncToken;
  },
});

export function createFreshTrackedWindowStoreState() {
  return createTrackedWindowStoreState();
}

export function getTrackedWindowId() {
  return isValidWindowId(trackedWindowState.windowId) ? trackedWindowState.windowId : null;
}

export function getTabRecord(tabId) {
  return cloneTabRecord(trackedWindowState.tabRecordsById[tabId] || null);
}

export function getTabRecordsById() {
  return cloneTabRecordsById(trackedWindowState.tabRecordsById);
}

export function listTabRecords() {
  return Object.values(getTabRecordsById());
}

export function listTabIds() {
  return Object.keys(trackedWindowState.tabRecordsById).map(Number);
}

export function canManageWindow(windowId) {
  return trackedWindowState.windowId == null || windowId === trackedWindowState.windowId;
}

export function resetTrackedWindowStore({ windowId = null } = {}) {
  const nextState = createFreshTrackedWindowStoreState();
  nextState.windowId = isValidWindowId(windowId) ? windowId : null;
  Object.assign(trackedWindowState, nextState);
  return trackedWindowStateView;
}

export function replaceAllTabRecords(tabRecordsById = {}) {
  trackedWindowState.tabRecordsById = { ...tabRecordsById };
  return trackedWindowState.tabRecordsById;
}

export function getWritableTabRecord(tabId) {
  return trackedWindowState.tabRecordsById[tabId] || null;
}

export function setTabRecord(tabId, record) {
  if (typeof tabId !== 'number' || !record) return null;
  trackedWindowState.tabRecordsById[tabId] = record;
  return trackedWindowState.tabRecordsById[tabId];
}

export function deleteTabRecord(tabId) {
  if (!trackedWindowState.tabRecordsById[tabId]) return false;
  delete trackedWindowState.tabRecordsById[tabId];
  return true;
}

export function setSnapshotSignature(signature = null) {
  trackedWindowState.snapshotSignature = signature;
  return trackedWindowState.snapshotSignature;
}

export function nextSyncToken() {
  trackedWindowState.syncToken += 1;
  return trackedWindowState.syncToken;
}

export function isSyncTokenCurrent(syncToken) {
  return syncToken === trackedWindowState.syncToken;
}

export function setSortState({
  trackedTabIdsInWindowOrder = [],
  targetVideoTabOrder = [],
  allEligibleVideosSorted = false,
  sortSummary = createEmptySortSummary(),
} = {}) {
  trackedWindowState.targetVideoTabOrder = [...targetVideoTabOrder];
  trackedWindowState.trackedTabIdsInWindowOrder = [...trackedTabIdsInWindowOrder];
  trackedWindowState.allEligibleVideosSorted = Boolean(allEligibleVideosSorted);
  trackedWindowState.sortSummary = cloneSortSummary(sortSummary);
}

export function setTrackedWindowId(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(trackedWindowState.windowId)) {
      trackedWindowState.windowId = windowId;
    }
  } else if (force && windowId == null) {
    trackedWindowState.windowId = null;
  }
  return getTrackedWindowId();
}
