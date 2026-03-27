import { EMPTY_READINESS_METRICS } from '../shared/readiness.js';

export const popupState = {
  ...EMPTY_READINESS_METRICS,
  tabsSorted: false,
  activeWindowId: null,
};

export function setActiveWindowId(windowId) {
  popupState.activeWindowId = typeof windowId === 'number' ? windowId : null;
}

export function updatePopupState(updates = {}) {
  Object.assign(popupState, updates);
}
