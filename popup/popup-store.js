import { EMPTY_READINESS_METRICS } from '../shared/readiness.js';

export const popupStore = {
  ...EMPTY_READINESS_METRICS,
  areTrackedTabsSorted: false,
  activeWindowId: null,
};

export function setActiveWindowId(windowId) {
  popupStore.activeWindowId = typeof windowId === 'number' ? windowId : null;
}

export function updateSortingState(updates = {}) {
  Object.assign(popupStore, updates);
}
