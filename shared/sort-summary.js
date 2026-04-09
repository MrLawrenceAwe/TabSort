export function createEmptySortSummary() {
  return {
    counts: {
      tracked: 0,
      ready: 0,
    },
    readyTabs: {
      contiguous: true,
      atFront: true,
      outOfOrder: false,
    },
    backgroundTabs: {
      haveStaleRemainingTime: false,
    },
    order: {
      allRemainingTimesKnown: false,
      allSorted: false,
    },
  };
}

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
    allRemainingTimesKnown: false,
    allSorted: false,
  }),
});
