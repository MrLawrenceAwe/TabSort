export const EMPTY_SORT_SUMMARY = Object.freeze({
  counts: Object.freeze({
    tracked: 0,
    sortReady: 0,
  }),
  sortReadyTabs: Object.freeze({
    contiguous: true,
    atFront: true,
    outOfOrder: false,
  }),
  inactiveTabs: Object.freeze({
    hasStaleRemainingTime: false,
  }),
  order: Object.freeze({
    allSortableTabsReady: false,
    currentOrderMatchesTarget: false,
  }),
});

export function cloneSortSummary(source = EMPTY_SORT_SUMMARY) {
  return {
    counts: {
      ...EMPTY_SORT_SUMMARY.counts,
      ...(source?.counts || {}),
    },
    sortReadyTabs: {
      ...EMPTY_SORT_SUMMARY.sortReadyTabs,
      ...(source?.sortReadyTabs || {}),
    },
    inactiveTabs: {
      ...EMPTY_SORT_SUMMARY.inactiveTabs,
      ...(source?.inactiveTabs || {}),
    },
    order: {
      ...EMPTY_SORT_SUMMARY.order,
      ...(source?.order || {}),
    },
  };
}

export function createEmptySortSummary() {
  return cloneSortSummary();
}
