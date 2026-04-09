import { createEmptySortSummary } from '../shared/sort-summary.js';

export const popupViewModel = {
  sortSummary: createEmptySortSummary(),
  allSortableTabsSorted: false,
  activeWindowId: null,
};

export function setActiveWindowId(windowId) {
  popupViewModel.activeWindowId = typeof windowId === 'number' ? windowId : null;
}

export function updatePopupViewModel(updates = {}) {
  Object.assign(popupViewModel, updates);
}
