import { cloneSortSummary, createEmptySortSummary } from '../shared/sort-summary.js';
import { isValidWindowId } from '../shared/guards.js';

export const getCurrentTimeMs = () => Date.now();

function createTrackedWindowState() {
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

const trackedWindowStateData = createTrackedWindowState();

const readonlyTabRecordsById = new Proxy(
  {},
  {
    get(_target, property) {
      return trackedWindowStateData.tabRecordsById[property];
    },
    getOwnPropertyDescriptor(_target, property) {
      if (!Object.prototype.hasOwnProperty.call(trackedWindowStateData.tabRecordsById, property)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        value: trackedWindowStateData.tabRecordsById[property],
      };
    },
    ownKeys() {
      return Reflect.ownKeys(trackedWindowStateData.tabRecordsById);
    },
    set() {
      throw new TypeError('Use window-state mutation helpers to update tab records.');
    },
    deleteProperty() {
      throw new TypeError('Use removeTabRecordFromState to delete tab records.');
    },
  },
);

export const trackedWindowState = Object.freeze({
  get tabRecordsById() {
    return readonlyTabRecordsById;
  },
  get targetSortableTabIds() {
    return [...trackedWindowStateData.targetSortableTabIds];
  },
  get visibleTabIds() {
    return [...trackedWindowStateData.visibleTabIds];
  },
  get currentOrderMatchesTarget() {
    return trackedWindowStateData.currentOrderMatchesTarget;
  },
  get sortSummary() {
    return cloneSortSummary(trackedWindowStateData.sortSummary);
  },
  get windowId() {
    return trackedWindowStateData.windowId;
  },
  get snapshotSignature() {
    return trackedWindowStateData.snapshotSignature;
  },
  get syncToken() {
    return trackedWindowStateData.syncToken;
  },
});

export function getTrackedWindowId() {
  return isValidWindowId(trackedWindowStateData.windowId) ? trackedWindowStateData.windowId : null;
}

export function getTabRecord(tabId) {
  return trackedWindowStateData.tabRecordsById[tabId] || null;
}

export function getTabRecordsById() {
  return trackedWindowStateData.tabRecordsById;
}

export function listTabRecords() {
  return Object.values(trackedWindowStateData.tabRecordsById);
}

export function resetTrackedWindowState({ windowId = null } = {}) {
  const nextState = createTrackedWindowState();
  nextState.windowId = isValidWindowId(windowId) ? windowId : null;
  Object.assign(trackedWindowStateData, nextState);
  return trackedWindowState;
}

export function replaceTabRecords(tabRecordsById = {}) {
  trackedWindowStateData.tabRecordsById = { ...tabRecordsById };
  return trackedWindowStateData.tabRecordsById;
}

export function writeTabRecord(tabId, record) {
  if (typeof tabId !== 'number' || !record) return null;
  trackedWindowStateData.tabRecordsById[tabId] = record;
  return trackedWindowStateData.tabRecordsById[tabId];
}

export function listTabIds() {
  return Object.keys(trackedWindowStateData.tabRecordsById).map(Number);
}

export function removeTabRecordFromState(tabId) {
  if (!trackedWindowStateData.tabRecordsById[tabId]) return false;
  delete trackedWindowStateData.tabRecordsById[tabId];
  return true;
}

export function setSnapshotSignature(signature = null) {
  trackedWindowStateData.snapshotSignature = signature;
  return trackedWindowStateData.snapshotSignature;
}

export function beginSync() {
  trackedWindowStateData.syncToken += 1;
  return trackedWindowStateData.syncToken;
}

export function isSyncCurrent(syncToken) {
  return syncToken === trackedWindowStateData.syncToken;
}

export function applySortState({
  visibleTabIds = [],
  targetSortableTabIds = [],
  currentOrderMatchesTarget = false,
  sortSummary = createEmptySortSummary(),
} = {}) {
  trackedWindowStateData.targetSortableTabIds = [...targetSortableTabIds];
  trackedWindowStateData.visibleTabIds = [...visibleTabIds];
  trackedWindowStateData.currentOrderMatchesTarget = Boolean(currentOrderMatchesTarget);
  trackedWindowStateData.sortSummary = cloneSortSummary(sortSummary);
}

export function setTrackedWindowId(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(trackedWindowStateData.windowId)) {
      trackedWindowStateData.windowId = windowId;
    }
  } else if (force && windowId == null) {
    trackedWindowStateData.windowId = null;
  }
  return getTrackedWindowId();
}

export function canManageWindow(windowId) {
  return trackedWindowStateData.windowId == null || windowId === trackedWindowStateData.windowId;
}
