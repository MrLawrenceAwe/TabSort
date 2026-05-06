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
  backgroundTabs: Object.freeze({
    haveStaleRemainingTime: false,
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
    backgroundTabs: {
      ...EMPTY_SORT_SUMMARY.backgroundTabs,
      ...(source?.backgroundTabs || {}),
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
