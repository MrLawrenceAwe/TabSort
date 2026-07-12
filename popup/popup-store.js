import { createSortSummary } from '../shared/sorting/summary.js';

export const popupState = {
  sortSummary: createSortSummary(),
  isSortComplete: false,
  activeWindowId: null,
};

export function resetPopupState() {
  popupState.sortSummary = createSortSummary();
  popupState.isSortComplete = false;
  popupState.activeWindowId = null;
}

export function setActiveWindowId(windowId) {
  popupState.activeWindowId = typeof windowId === 'number' ? windowId : null;
}

export function applyPopupState(updates = {}) {
  Object.assign(popupState, updates);
}
