export function createEmptyReadinessMetrics() {
  return {
    trackedTabCount: 0,
    readyTabCount: 0,
    hasBackgroundTabsWithStaleRemaining: false,
    areReadyTabsContiguous: true,
    areReadyTabsAtFront: true,
    areReadyTabsOutOfOrder: false,
    areAllTimesKnown: false,
    areAllSorted: false,
  };
}

export const EMPTY_READINESS_METRICS = Object.freeze(createEmptyReadinessMetrics());
