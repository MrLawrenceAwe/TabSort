import { isValidWindowId } from '../shared/guards.js';

export const managedState = {
  tabRecordsById: {},
  targetOrder: [],
  visibleOrder: [],
  allSortableTabsSorted: false,
  sortSummary: null,
  managedWindowId: null,
  snapshotSignature: null,
  syncToken: 0,
};

export const now = () => Date.now();

export function setManagedWindowId(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(managedState.managedWindowId)) {
      managedState.managedWindowId = windowId;
    }
  } else if (force && windowId == null) {
    managedState.managedWindowId = null;
  }
  return isValidWindowId(managedState.managedWindowId) ? managedState.managedWindowId : null;
}

export function canManageWindow(windowId) {
  return managedState.managedWindowId == null || windowId === managedState.managedWindowId;
}
