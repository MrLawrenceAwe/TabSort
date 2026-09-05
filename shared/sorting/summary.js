const EMPTY_SORT_SUMMARY = Object.freeze({
  sortableCount: 0,
  readyCount: 0,
  readyPrefixMatchesPlan: true,
});

export function createSortSummary(source = EMPTY_SORT_SUMMARY) {
  return {
    ...EMPTY_SORT_SUMMARY,
    ...(source || {}),
  };
}
