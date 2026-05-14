import { broadcastSnapshotUpdate } from './tab-snapshot.js';
import { deriveSortPlan } from './tab-order/derive-sort-plan.js';
import { deriveSortSummary } from './tab-order/derive-sort-summary.js';
import { listTabRecords, setSortState } from './window-store.js';

function deriveSortState(records) {
  const sortPlan = deriveSortPlan(records);
  const sortSummary = deriveSortSummary({
    trackedRecords: records,
    eligibleVideoRecords: sortPlan.eligibleVideoRecords,
    eligibleVideoTabIdsInCurrentOrder: sortPlan.eligibleVideoTabIdsInCurrentOrder,
    readyVideoTabIdsInCurrentOrder: sortPlan.readyVideoTabIdsInCurrentOrder,
    readyVideoTabIdsByRemainingTime: sortPlan.readyVideoTabIdsByRemainingTime,
  });

  return {
    visibleTabIds: sortPlan.visibleTabIds,
    plannedVideoTabIds: sortPlan.plannedVideoTabIds,
    readyTabsAlreadySorted: sortPlan.readyTabsAlreadySorted,
    sortSummary,
  };
}

export function recomputeSortState() {
  const records = listTabRecords();
  const derivedState = deriveSortState(records);
  setSortState(derivedState);
  broadcastSnapshotUpdate();
}
