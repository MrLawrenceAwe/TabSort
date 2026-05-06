import { createEmptySortSummary } from '../shared/sort-summary.js';

export const popupUiState = {
  sortSummary: createEmptySortSummary(),
  currentOrderMatchesTarget: false,
  activeWindowId: null,
};

export function resetPopupUiState() {
  popupUiState.sortSummary = createEmptySortSummary();
  popupUiState.currentOrderMatchesTarget = false;
  popupUiState.activeWindowId = null;
}

export function setActiveWindowId(windowId) {
  popupUiState.activeWindowId = typeof windowId === 'number' ? windowId : null;
}

export function applyPopupUiState(updates = {}) {
  Object.assign(popupUiState, updates);
}
