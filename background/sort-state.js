import { broadcastSnapshotUpdate } from './tab-snapshot.js';
import { deriveSortPlan } from './sorting/sort-plan.js';
import { deriveSortSummary } from './sorting/sort-summary.js';
import { applySortState, trackedWindowState } from './tracked-window-state.js';

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
