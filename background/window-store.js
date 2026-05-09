import { cloneSortSummary, createEmptySortSummary } from '../shared/sort-summary.js';

export const getCurrentTimeMs = () => Date.now();

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

const readonlyTabRecordsById = new Proxy(
  {},
  {
    get(_target, property) {
      return trackedWindowStoreState.tabRecordsById[property];
    },
    getOwnPropertyDescriptor(_target, property) {
      if (!Object.prototype.hasOwnProperty.call(trackedWindowStoreState.tabRecordsById, property)) {
        return undefined;
      }
      return {
        configurable: true,
        enumerable: true,
        value: trackedWindowStoreState.tabRecordsById[property],
      };
    },
    ownKeys() {
      return Reflect.ownKeys(trackedWindowStoreState.tabRecordsById);
    },
    set() {
      throw new TypeError('Use window store mutation helpers to update tab records.');
    },
    deleteProperty() {
      throw new TypeError('Use removeTabRecordFromStore to delete tab records.');
    },
  },
);

export const trackedWindowState = Object.freeze({
  get tabRecordsById() {
    return readonlyTabRecordsById;
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
