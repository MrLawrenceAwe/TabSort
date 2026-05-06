import { broadcastSnapshotUpdate } from './tab-snapshot.js';
import { deriveSortOrder } from './sort-order.js';
import { deriveSortSummary } from './sort-summary.js';
import { applySortState, trackedWindowState } from './tracked-window-state.js';

function deriveSortState(records) {
  const sortOrder = deriveSortOrder(records);
  const sortSummary = deriveSortSummary({
    trackedRecords: records,
    sortableRecords: sortOrder.sortableRecords,
    sortableOrder: sortOrder.sortableOrder,
  });

  return {
    visibleOrder: sortOrder.visibleOrder,
    targetOrder: sortOrder.targetOrder,
    sortableVideosSortedByTime: sortOrder.sortableVideosSortedByTime,
    sortSummary,
  };
}

function applyDerivedSortState({
  visibleOrder,
  targetOrder,
  sortableVideosSortedByTime,
  sortSummary,
}) {
  applySortState({
    targetOrder,
    visibleOrder,
    sortableVideosSortedByTime,
    sortSummary,
  });
  broadcastSnapshotUpdate();
}

export function recomputeSortState() {
  const records = Object.values(trackedWindowState.tabRecordsById);
  const derivedState = deriveSortState(records);
  applyDerivedSortState(derivedState);
}
