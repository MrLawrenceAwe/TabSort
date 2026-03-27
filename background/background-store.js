import { isValidWindowId } from '../shared/guards.js';

export const backgroundStore = {
  trackedVideoTabsById: {},
  targetSortOrderTabIds: [],
  visibleTabOrderTabIds: [],
  areTrackedTabsSorted: false,
  readinessMetrics: null,
  trackedWindowId: null,
  lastSnapshotSignature: null,
  refreshToken: 0,
};

export const now = () => Date.now();

export function setTrackedWindowIdIfNeeded(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(backgroundStore.trackedWindowId)) {
      backgroundStore.trackedWindowId = windowId;
    }
  } else if (force && windowId == null) {
    backgroundStore.trackedWindowId = null;
  }
  return isValidWindowId(backgroundStore.trackedWindowId) ? backgroundStore.trackedWindowId : null;
}
