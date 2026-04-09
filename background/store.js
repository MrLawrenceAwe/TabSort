import { isValidWindowId } from '../shared/guards.js';

export const backgroundStore = {
  trackedTabsById: {},
  targetOrder: [],
  visibleOrder: [],
  allSortableTabsSorted: false,
  sortSummary: null,
  trackedWindowId: null,
  snapshotSignature: null,
  syncToken: 0,
};

export const now = () => Date.now();

export function setTrackedWindowId(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(backgroundStore.trackedWindowId)) {
      backgroundStore.trackedWindowId = windowId;
    }
  } else if (force && windowId == null) {
    backgroundStore.trackedWindowId = null;
  }
  return isValidWindowId(backgroundStore.trackedWindowId) ? backgroundStore.trackedWindowId : null;
}

export function canHandleWindow(windowId) {
  return backgroundStore.trackedWindowId == null || windowId === backgroundStore.trackedWindowId;
}
