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
    targetVideoOrder: [],
    visibleTabIds: [],
    currentOrderMatchesTarget: false,
    sortSummary: createEmptySortSummary(),
    windowId: null,
    snapshotSignature: null,
    syncToken: 0,
  };
}

export const mutableTrackedWindowState = createTrackedWindowStoreState();

export const readonlyTrackedWindowState = Object.freeze({
  get tabRecordsById() {
    return cloneTabRecordsById(mutableTrackedWindowState.tabRecordsById);
  },
  get targetVideoOrder() {
    return [...mutableTrackedWindowState.targetVideoOrder];
  },
  get visibleTabIds() {
    return [...mutableTrackedWindowState.visibleTabIds];
  },
  get currentOrderMatchesTarget() {
    return mutableTrackedWindowState.currentOrderMatchesTarget;
  },
  get sortSummary() {
    return cloneSortSummary(mutableTrackedWindowState.sortSummary);
  },
  get windowId() {
    return mutableTrackedWindowState.windowId;
  },
  get snapshotSignature() {
    return mutableTrackedWindowState.snapshotSignature;
  },
  get syncToken() {
    return mutableTrackedWindowState.syncToken;
  },
});

export function createFreshTrackedWindowStoreState() {
  return createTrackedWindowStoreState();
}

export function getTrackedWindowId() {
  return isValidWindowId(mutableTrackedWindowState.windowId) ? mutableTrackedWindowState.windowId : null;
}

export function getTabRecord(tabId) {
  return cloneTabRecord(mutableTrackedWindowState.tabRecordsById[tabId] || null);
}

export function getTabRecordsById() {
  return cloneTabRecordsById(mutableTrackedWindowState.tabRecordsById);
}

export function listTabRecords() {
  return Object.values(getTabRecordsById());
}

export function listTabIds() {
  return Object.keys(mutableTrackedWindowState.tabRecordsById).map(Number);
}

export function canManageWindow(windowId) {
  return mutableTrackedWindowState.windowId == null || windowId === mutableTrackedWindowState.windowId;
}

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
  targetVideoOrder = [],
  currentOrderMatchesTarget = false,
  sortSummary = createEmptySortSummary(),
} = {}) {
  mutableTrackedWindowState.targetVideoOrder = [...targetVideoOrder];
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
