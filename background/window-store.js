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

export const trackedWindowStoreState = createTrackedWindowStoreState();

export const trackedWindowState = Object.freeze({
  get tabRecordsById() {
    return cloneTabRecordsById(trackedWindowStoreState.tabRecordsById);
  },
  get targetSortableTabIds() {
    return [...trackedWindowStoreState.targetSortableTabIds];
  },
  get visibleTabIds() {
    return [...trackedWindowStoreState.visibleTabIds];
  },
  get currentOrderMatchesTarget() {
    return trackedWindowStoreState.currentOrderMatchesTarget;
  },
  get sortSummary() {
    return cloneSortSummary(trackedWindowStoreState.sortSummary);
  },
  get windowId() {
    return trackedWindowStoreState.windowId;
  },
  get snapshotSignature() {
    return trackedWindowStoreState.snapshotSignature;
  },
  get syncToken() {
    return trackedWindowStoreState.syncToken;
  },
});

export function createFreshTrackedWindowStoreState() {
  return createTrackedWindowStoreState();
}
