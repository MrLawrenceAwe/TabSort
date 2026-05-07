import { broadcastSnapshotUpdate } from './tab-snapshot.js';
import { deriveSortOrder } from './sorting/derive-sort-order.js';
import { deriveSortSummary } from './sorting/derive-sort-summary.js';
import { applySortState, listTabRecords } from './window-state.js';

function deriveSortState(records) {
  const sortPlan = deriveSortOrder(records);
  const sortSummary = deriveSortSummary({
    trackedRecords: records,
    sortableRecords: sortPlan.sortableRecords,
    currentSortableTabIds: sortPlan.currentSortableTabIds,
  });

  return {
    visibleTabIds: sortPlan.visibleTabIds,
    targetSortableTabIds: sortPlan.targetSortableTabIds,
    currentOrderMatchesTarget: sortPlan.currentOrderMatchesTarget,
    sortSummary,
  };
}

export function recomputeSortState() {
  const records = listTabRecords();
  const derivedState = deriveSortState(records);
  applySortState(derivedState);
  broadcastSnapshotUpdate();
}
