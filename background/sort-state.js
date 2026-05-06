import { broadcastSnapshotUpdate } from './tab-snapshot.js';
import { deriveSortPlan } from './sort-plan.js';
import { deriveSortSummary } from './derive-sort-summary.js';
import { applySortState, trackedWindowState } from './tracked-window-state.js';

function deriveSortState(records) {
  const sortPlan = deriveSortPlan(records);
  const sortSummary = deriveSortSummary({
    trackedRecords: records,
    sortableRecords: sortPlan.sortableRecords,
    sortableOrder: sortPlan.sortableOrder,
  });

  return {
    visibleOrder: sortPlan.visibleOrder,
    targetSortableVideoOrder: sortPlan.targetSortableVideoOrder,
    sortableVideosSortedByRemainingTime: sortPlan.sortableVideosSortedByRemainingTime,
    sortSummary,
  };
}

function applyDerivedSortState({
  visibleOrder,
  targetSortableVideoOrder,
  sortableVideosSortedByRemainingTime,
  sortSummary,
}) {
  applySortState({
    targetSortableVideoOrder,
    visibleOrder,
    sortableVideosSortedByRemainingTime,
    sortSummary,
  });
  broadcastSnapshotUpdate();
}

export function recomputeSortState() {
  const records = Object.values(trackedWindowState.tabRecordsById);
  const derivedState = deriveSortState(records);
  applyDerivedSortState(derivedState);
}
