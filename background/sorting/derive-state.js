import { isFiniteNumber } from '../../shared/guards.js';
import { createSortSummary } from '../../shared/sorting/summary.js';
import { hasReadyRemainingTime } from './readiness.js';
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

export function deriveSortState(records, { tabsInWindowOrder = [] } = {}) {
  const trackedTabIdsInWindowOrder = tabIdsByPosition(records);
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
  const plannedVideoTabOrder = [...readyTabIdsByRemainingTime, ...waitingTabIds];
  const hasTabStripState = Array.isArray(tabsInWindowOrder) && tabsInWindowOrder.length > 0;
  const unpinnedTabs = hasTabStripState
    ? tabsInWindowOrder
      .filter((tab) => tab && !tab.pinned)
      .sort((left, right) => left.index - right.index)
    : [];
  const unpinnedTabIds = unpinnedTabs.map((tab) => tab.id);
  const expectedYouTubeTabOrder = hasTabStripState
    ? buildYouTubeTabOrder(unpinnedTabs, plannedVideoTabOrder)
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

  const allSortableVideosReady = sortableRecords.length > 1 && waitingTabIds.length === 0;
  const youtubeTabStripMatchesPlan =
    !hasTabStripState ||
    expectedYouTubeTabOrder.every((id, index) => unpinnedTabIds[index] === id);
  const isSortComplete =
    allSortableVideosReady &&
    tabIdsEqual(sortableTabIds, readyTabIdsByRemainingTime) &&
    youtubeTabStripMatchesPlan;
  const inactiveTabsHaveStaleRemainingTime = sortableRecords.some(
    (record) => record.remainingTimeStale && (!record.isActive || record.isHidden),
  );

  return {
    trackedTabIdsInWindowOrder,
    plannedVideoTabOrder,
    isSortComplete,
    sortSummary: createSortSummary({
      counts: {
        tracked: records.length,
        sortReady: readyRecords.length,
      },
      sortReadyTabs: {
        contiguous: readyTabsAreContiguous,
        atFront: readyTabsAreAtFront,
        outOfOrder:
          readyTabIdsInCurrentOrder.length >= 2 &&
          !tabIdsEqual(readyTabIdsInCurrentOrder, readyTabIdsByRemainingTime),
      },
      inactiveTabs: {
        hasStaleRemainingTime: inactiveTabsHaveStaleRemainingTime,
      },
      order: {
        allSortableVideosReady,
      },
    }),
  };
}
