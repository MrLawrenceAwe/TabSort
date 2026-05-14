import { cloneSortSummary, createEmptySortSummary } from '../shared/sort-summary.js';

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
    targetSortableTabIds: [],
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
  get targetSortableTabIds() {
    return [...mutableTrackedWindowState.targetSortableTabIds];
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
