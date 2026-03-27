import { isValidWindowId } from '../shared/guards.js';

export const backgroundStore = {
  trackedTabsById: {},
  targetOrder: [],
  visibleOrder: [],
  tabsSorted: false,
  readiness: null,
  trackedWindowId: null,
  snapshotSignature: null,
  syncToken: 0,
};

export const now = () => Date.now();

export function updateTrackedWindowId(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(backgroundStore.trackedWindowId)) {
      backgroundStore.trackedWindowId = windowId;
    }
  } else if (force && windowId == null) {
    backgroundStore.trackedWindowId = null;
  }
  return isValidWindowId(backgroundStore.trackedWindowId) ? backgroundStore.trackedWindowId : null;
}
