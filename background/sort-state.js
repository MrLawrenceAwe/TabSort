import { broadcastSnapshotUpdate } from './tab-snapshot.js';
import { deriveSortOrder } from './sorting/derive-sort-order.js';
import { deriveSortSummary } from './sorting/derive-sort-summary.js';
import { applySortState, trackedWindowState } from './window-state.js';

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

function applyDerivedSortState({
  visibleTabIds,
  targetSortableTabIds,
  currentOrderMatchesTarget,
  sortSummary,
}) {
  applySortState({
    targetSortableTabIds,
    visibleTabIds,
    currentOrderMatchesTarget,
    sortSummary,
  });
  broadcastSnapshotUpdate();
}

export function recomputeSortState() {
  const records = Object.values(trackedWindowState.tabRecordsById);
  const derivedState = deriveSortState(records);
  applyDerivedSortState(derivedState);
}
