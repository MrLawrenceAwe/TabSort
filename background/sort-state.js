import { broadcastSnapshotUpdate } from './tab-snapshot.js';
import { deriveSortPlan } from './tab-order/derive-sort-plan.js';
import { deriveSortSummary } from './tab-order/derive-sort-summary.js';
import { listTabRecords } from './window-store-selectors.js';
import { setSortState } from './window-store-mutations.js';

function deriveSortState(records) {
  const sortPlan = deriveSortPlan(records);
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
  setSortState(derivedState);
  broadcastSnapshotUpdate();
}
