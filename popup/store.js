import { createSortSummary } from '../shared/sorting/summary.js';

export const popupState = {
  sortSummary: createSortSummary(),
  isTargetOrderApplied: false,
  isOrganising: false,
  activeWindowId: null,
};

export function resetPopupState() {
  popupState.sortSummary = createSortSummary();
  popupState.isTargetOrderApplied = false;
  popupState.isOrganising = false;
  popupState.activeWindowId = null;
}

export function setActiveWindowId(windowId) {
  popupState.activeWindowId = typeof windowId === 'number' ? windowId : null;
}

export function isSnapshotForActiveWindow(snapshot) {
  return snapshot?.windowId === popupState.activeWindowId;
}

export function applyPopupState(updates = {}) {
  Object.assign(popupState, updates);
}
