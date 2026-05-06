import { broadcastSnapshotUpdate } from './tab-snapshot.js';
import { deriveRemainingTimePlan } from './sorting/derive-remaining-time-plan.js';
import { deriveSortSummary } from './sorting/derive-sort-summary.js';
import { windowSessionState } from './window-session.js';
import { applySortState } from './window-session-actions.js';

function deriveSortState(records) {
  const sortPlan = deriveRemainingTimePlan(records);
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
  const records = Object.values(windowSessionState.tabRecordsById);
  const derivedState = deriveSortState(records);
  applyDerivedSortState(derivedState);
}
