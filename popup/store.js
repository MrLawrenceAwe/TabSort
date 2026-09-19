import { createSortSummary } from '../shared/sorting/summary.js';

function createInitialPopupState() {
  return {
    sortSummary: createSortSummary(),
    isYouTubeLayoutOrganised: false,
    isOrganising: false,
    isStartingAutoPreparation: false,
    autoPreparation: { status: 'idle' },
    activeWindowId: null,
  };
}

export const popupState = createInitialPopupState();

export function resetPopupState() {
  Object.assign(popupState, createInitialPopupState());
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
