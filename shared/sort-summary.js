export const EMPTY_SORT_SUMMARY = Object.freeze({
  counts: Object.freeze({
    tracked: 0,
    ready: 0,
  }),
  readyTabs: Object.freeze({
    contiguous: true,
    atFront: true,
    outOfOrder: false,
  }),
  backgroundTabs: Object.freeze({
    haveStaleRemainingTime: false,
  }),
  order: Object.freeze({
    allSortableVodDurationsKnown: false,
    allSortableVodTabsSorted: false,
  }),
});

export function cloneSortSummary(source = EMPTY_SORT_SUMMARY) {
  return {
    counts: {
      ...EMPTY_SORT_SUMMARY.counts,
      ...(source?.counts || {}),
    },
    readyTabs: {
      ...EMPTY_SORT_SUMMARY.readyTabs,
      ...(source?.readyTabs || {}),
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
