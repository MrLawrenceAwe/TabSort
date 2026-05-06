import { createEmptySortSummary } from '../shared/sort-summary.js';
import { areTabIdListsEqual } from './sort-order.js';
import { hasReadyRemainingTime } from './sort-readiness.js';

export function deriveSortSummary({ trackedRecords, sortableRecords, sortableOrder }) {
  if (!Array.isArray(trackedRecords) || trackedRecords.length === 0) {
    return createEmptySortSummary();
  }

  const recordMap = new Map(sortableRecords.map((record) => [record.id, record]));
  const trackedTabCount = trackedRecords.length;
  const sortableTabCount = sortableRecords.length;

  let backgroundTabsHaveStaleRemainingTime = false;
  let readyTabCount = 0;
  let readyTabsAreContiguous = true;
  let readyTabsAreAtFront = true;
  let readyTabsAreOutOfOrder = false;

  const readyIdsInCurrentOrder = [];
  const readyEntries = [];
  const orderedIdsWithRecords = [];

  let encounteredReady = false;
  let encounteredNonReadyBeforeReady = false;
  let gapAfterReady = false;

  for (const tabId of sortableOrder) {
    const record = recordMap.get(tabId);
    if (!record) continue;
    orderedIdsWithRecords.push(tabId);

    if (record.isRemainingTimeStale && (!record.isActiveTab || record.isHidden)) {
      backgroundTabsHaveStaleRemainingTime = true;
    }

    const isReady = hasReadyRemainingTime(record);
    if (isReady) {
      readyTabCount += 1;
      readyIdsInCurrentOrder.push(record.id);
      readyEntries.push({ id: record.id, remainingTime: record.videoDetails?.remainingTime || 0 });
      encounteredReady = true;
      if (gapAfterReady) readyTabsAreContiguous = false;
      continue;
    }

    if (!encounteredReady) {
      encounteredNonReadyBeforeReady = true;
    } else {
      gapAfterReady = true;
    }
  }

  if (encounteredReady && encounteredNonReadyBeforeReady) {
    readyTabsAreAtFront = false;
  }

  const readyIdsByRemainingTime = readyEntries
    .slice()
    .sort((a, b) => a.remainingTime - b.remainingTime)
    .map((entry) => entry.id);

  if (readyIdsInCurrentOrder.length >= 2) {
    readyTabsAreOutOfOrder = !areTabIdListsEqual(
      readyIdsInCurrentOrder,
      readyIdsByRemainingTime,
    );
  }

  const allSortableVideosReady = sortableTabCount > 1 && readyTabCount === sortableTabCount;
  const sortableVideosSortedByTime =
    allSortableVideosReady && areTabIdListsEqual(orderedIdsWithRecords, readyIdsByRemainingTime);

  return {
    counts: {
      tracked: trackedTabCount,
      ready: readyTabCount,
    },
    readyTabs: {
      contiguous: readyTabsAreContiguous,
      atFront: readyTabsAreAtFront,
      outOfOrder: readyTabsAreOutOfOrder,
    },
    backgroundTabs: {
      haveStaleRemainingTime: backgroundTabsHaveStaleRemainingTime,
    },
    order: {
      allSortableVideosReady,
      sortableVideosSortedByTime,
    },
  };
}
