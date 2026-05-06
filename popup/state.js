import { createEmptySortSummary } from '../shared/sort-summary.js';

export const popupState = {
  sortSummary: createEmptySortSummary(),
  currentOrderMatchesTarget: false,
  activeWindowId: null,
};

export function resetPopupState() {
  popupState.sortSummary = createEmptySortSummary();
  popupState.currentOrderMatchesTarget = false;
  popupState.activeWindowId = null;
}

export function setActiveWindowId(windowId) {
  popupState.activeWindowId = typeof windowId === 'number' ? windowId : null;
}

export function applyPopupState(updates = {}) {
  Object.assign(popupState, updates);
}
