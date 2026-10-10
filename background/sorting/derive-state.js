import { isFiniteNumber } from '../../shared/guards.js';
import { createSortSummary } from '../../shared/sorting/summary.js';
import { hasReadyRemainingTime } from '../../shared/tabs/sort-readiness.js';
import { buildTabOrder } from './move-order.js';

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
  const readyTabIdsByRemainingTime = readyRecords
    .slice()
    .sort((left, right) =>
      left.videoDetails.remainingSeconds - right.videoDetails.remainingSeconds)
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
  const expectedTabOrder = hasTabStripState
    ? buildTabOrder(unpinnedTabs, targetVideoTabOrder)
    : [];

  // Compare against the complete unpinned strip when available. Without it,
  // compare against tracked sortable tabs, including waiting tabs at the front.
  const currentOrder = hasTabStripState ? unpinnedTabIds : sortableTabIds;
  const readyTabsLeadInOrder = readyTabIdsByRemainingTime.every(
    (id, index) => currentOrder[index] === id,
  );

  const allSortableTabsReady = sortableRecords.length > 1 && waitingTabIds.length === 0;
  const tabStripMatchesPlan =
    !hasTabStripState ||
    expectedTabOrder.every((id, index) => unpinnedTabIds[index] === id);
  // Compare with the achievable plan: existing groups stay contiguous, even
  // when they contain other sites or videos with different remaining times.
  const isYouTubeLayoutOrganised =
    allSortableTabsReady &&
    (hasTabStripState || tabIdsEqual(sortableTabIds, readyTabIdsByRemainingTime)) &&
    tabStripMatchesPlan;
  return {
    trackedTabOrder,
    targetVideoTabOrder,
    isYouTubeLayoutOrganised,
    sortSummary: createSortSummary({
      sortableCount: sortableRecords.length,
      readyCount: readyRecords.length,
      readyTabsLeadInOrder,
    }),
  };
}
