import { isValidWindowId } from '../shared/utils.js';

export const trackingState = {
  trackedTabsById: {},
  targetOrder: [],
  visibleOrder: [],
  allSortableTabsSorted: false,
  sortSummary: null,
  trackedWindowId: null,
  snapshotSignature: null,
  syncToken: 0,
};

export const backgroundStore = trackingState;

export const now = () => Date.now();

export function setTrackedWindowId(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(trackingState.trackedWindowId)) {
      trackingState.trackedWindowId = windowId;
    }
  } else if (force && windowId == null) {
    trackingState.trackedWindowId = null;
  }
  return isValidWindowId(trackingState.trackedWindowId) ? trackingState.trackedWindowId : null;
}

export function canHandleWindow(windowId) {
  return trackingState.trackedWindowId == null || windowId === trackingState.trackedWindowId;
}
