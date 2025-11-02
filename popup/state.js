export const popupState = {
  tabsInCurrentWindowAreKnownToBeSorted: false,
  totalWatchTabsInWindow: 0,
  watchTabsReadyCount: 0,
  knownWatchTabsOutOfOrder: false,
  activeWindowId: null,
  hiddenTabsMayHaveStaleRemaining: false,
  readyTabsAreContiguous: true,
  readyTabsAreAtFront: true,
};

export function setActiveWindowId(windowId) {
  popupState.activeWindowId = typeof windowId === 'number' ? windowId : null;
}

export function updateSortingState(updates = {}) {
  Object.assign(popupState, updates);
}
