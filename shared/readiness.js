export function createEmptyReadinessMetrics() {
  return {
    totalWatchTabsInWindow: 0,
    watchTabsReadyCount: 0,
    hiddenTabsMayHaveStaleRemaining: false,
    readyTabsAreContiguous: true,
    readyTabsAreAtFront: true,
    knownWatchTabsOutOfOrder: false,
    allKnown: false,
    computedAllSorted: false,
  };
}

export const EMPTY_READINESS_METRICS = Object.freeze(createEmptyReadinessMetrics());
