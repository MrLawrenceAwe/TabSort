import { broadcastSnapshotUpdate } from './tab-snapshot.js';
import { deriveSortPlan } from './tab-order/derive-sort-plan.js';
import { deriveSortSummary } from './tab-order/derive-sort-summary.js';
import { listTabRecords, setSortState } from './tracked-window-store.js';

function deriveSortState(records) {
  const sortPlan = deriveSortPlan(records);
  const sortSummary = deriveSortSummary({
    trackedRecords: records,
    eligibleVideoRecords: sortPlan.eligibleVideoRecords,
    eligibleIdsInTabOrder: sortPlan.eligibleIdsInTabOrder,
    readyVideoTabIdsInCurrentOrder: sortPlan.readyVideoTabIdsInCurrentOrder,
    readyVideoTabIdsByRemainingTime: sortPlan.readyVideoTabIdsByRemainingTime,
  });

  return {
    trackedTabIdsInWindowOrder: sortPlan.trackedTabIdsInWindowOrder,
    targetVideoTabOrder: sortPlan.targetVideoTabOrder,
    allEligibleVideosSorted: sortPlan.allEligibleVideosSorted,
    sortSummary,
  };
}

export function recomputeSortState() {
  const records = listTabRecords();
  const derivedState = deriveSortState(records);
  setSortState(derivedState);
  broadcastSnapshotUpdate();
}
