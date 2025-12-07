import { EMPTY_READINESS_METRICS } from '../shared/readiness.js';

export const popupState = {
  ...EMPTY_READINESS_METRICS,
  tabsInCurrentWindowAreKnownToBeSorted: false,
  activeWindowId: null,
};

export function setActiveWindowId(windowId) {
  popupState.activeWindowId = typeof windowId === 'number' ? windowId : null;
}

export function updateSortingState(updates = {}) {
  Object.assign(popupState, updates);
}

