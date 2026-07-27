import { isFiniteNumber } from '../../shared/guards.js';
import { createSortSummary } from '../../shared/sorting/summary.js';
import { hasReadyRemainingTime } from './sort-readiness.js';
import { buildYouTubeTabOrder } from './move-order.js';

function tabIdsEqual(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function tabIdsByPosition(records) {
  const position = (record) =>
    (isFiniteNumber(record?.index) ? record.index : Number.MAX_SAFE_INTEGER);
  return records
    .slice()
    .sort((left, right) => position(left) - position(right) || left.id - right.id)
    .map((record) => record.id);
}

export function deriveSortState(records, { orderedWindowTabs = [] } = {}) {
  const trackedTabOrder = tabIdsByPosition(records);
  const sortableRecords = records.filter((record) => !record.pinned && !record.isLive);
  const sortableTabIds = tabIdsByPosition(sortableRecords);
  const readyRecords = sortableRecords.filter(hasReadyRemainingTime);
  const readyTabIds = new Set(readyRecords.map((record) => record.id));
  const readyTabIdsInCurrentOrder = sortableTabIds.filter((id) => readyTabIds.has(id));
  const readyTabIdsByRemainingTime = readyRecords
    .slice()
    .sort((left, right) =>
      left.videoDetails.remainingTime - right.videoDetails.remainingTime)
    .map((record) => record.id);
  const waitingTabIds = sortableTabIds.filter((id) => !readyTabIds.has(id));
  const targetVideoTabOrder = [...readyTabIdsByRemainingTime, ...waitingTabIds];
  const hasTabStripState = Array.isArray(orderedWindowTabs) && orderedWindowTabs.length > 0;
  const unpinnedTabs = hasTabStripState
    ? orderedWindowTabs
      .filter((tab) => tab && !tab.pinned)
      .sort((left, right) => left.index - right.index)
    : [];
  const unpinnedTabIds = unpinnedTabs.map((tab) => tab.id);
  const expectedYouTubeTabOrder = hasTabStripState
    ? buildYouTubeTabOrder(unpinnedTabs, targetVideoTabOrder)
    : [];

  let readyTabsAreContiguous = true;
  let readyTabsAreAtFront = true;
  let encounteredReady = false;
  let encounteredWaiting = false;
  for (const id of sortableTabIds) {
    if (readyTabIds.has(id)) {
      if (encounteredWaiting) readyTabsAreAtFront = false;
      if (encounteredReady && encounteredWaiting) readyTabsAreContiguous = false;
      encounteredReady = true;
    } else if (encounteredReady) {
      encounteredWaiting = true;
    }
  }
  if (hasTabStripState && readyTabIdsByRemainingTime.length > 0) {
    readyTabsAreAtFront = readyTabIdsByRemainingTime.every(
      (id, index) => unpinnedTabIds[index] === id,
    );
  }

  const allSortableTabsReady = sortableRecords.length > 1 && waitingTabIds.length === 0;
  const youtubeTabStripMatchesPlan =
    !hasTabStripState ||
    expectedYouTubeTabOrder.every((id, index) => unpinnedTabIds[index] === id);
  const isTargetOrderApplied =
    allSortableTabsReady &&
    tabIdsEqual(sortableTabIds, readyTabIdsByRemainingTime) &&
    youtubeTabStripMatchesPlan;
  return {
    trackedTabOrder,
    targetVideoTabOrder,
    isTargetOrderApplied,
    sortSummary: createSortSummary({
      trackedCount: records.length,
      sortableCount: sortableRecords.length,
      readyCount: readyRecords.length,
      readyTabsContiguous: readyTabsAreContiguous,
      readyTabsAtFront: readyTabsAreAtFront,
      readyTabsOutOfOrder:
        readyTabIdsInCurrentOrder.length >= 2 &&
        !tabIdsEqual(readyTabIdsInCurrentOrder, readyTabIdsByRemainingTime),
      allSortableTabsReady,
    }),
  };
}
