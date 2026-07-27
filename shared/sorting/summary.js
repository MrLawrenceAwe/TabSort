const EMPTY_SORT_SUMMARY = Object.freeze({
  trackedCount: 0,
  sortableCount: 0,
  readyCount: 0,
  readyTabsContiguous: true,
  readyTabsAtFront: true,
  readyTabsOutOfOrder: false,
  allSortableTabsReady: false,
});

export function createSortSummary(source = EMPTY_SORT_SUMMARY) {
  return {
    ...EMPTY_SORT_SUMMARY,
    ...(source || {}),
  };
}
