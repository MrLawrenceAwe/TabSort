import { createEmptySortSummary } from '../../shared/sort-summary-model.js';
import { areTabIdListsEqual } from './sort-plan.js';
import { hasReadyRemainingTime } from '../sort-readiness.js';

export function deriveSortSummary({ trackedRecords, sortableRecords, currentSortableTabIds }) {
  if (!Array.isArray(trackedRecords) || trackedRecords.length === 0) {
    return createEmptySortSummary();
  }

  const recordMap = new Map(sortableRecords.map((record) => [record.id, record]));
  const trackedTabCount = trackedRecords.length;
  const sortableTabCount = sortableRecords.length;

  let backgroundTabsHaveStaleRemainingTime = false;
  let sortReadyTabCount = 0;
  let sortReadyTabsAreContiguous = true;
  let sortReadyTabsAreAtFront = true;
  let sortReadyTabsAreOutOfOrder = false;

  const sortReadyIdsInCurrentOrder = [];
  const sortReadyEntries = [];
  const orderedIdsWithRecords = [];

  let encounteredReady = false;
  let encounteredNonReadyBeforeReady = false;
  let gapAfterReady = false;

  for (const tabId of currentSortableTabIds) {
    const record = recordMap.get(tabId);
    if (!record) continue;
    orderedIdsWithRecords.push(tabId);

    if (record.isRemainingTimeStale && (!record.isActiveTab || record.isHidden)) {
      backgroundTabsHaveStaleRemainingTime = true;
    }

    const isReady = hasReadyRemainingTime(record);
    if (isReady) {
      sortReadyTabCount += 1;
      sortReadyIdsInCurrentOrder.push(record.id);
      sortReadyEntries.push({ id: record.id, remainingTime: record.videoDetails?.remainingTime || 0 });
      encounteredReady = true;
      if (gapAfterReady) sortReadyTabsAreContiguous = false;
      continue;
    }

    if (!encounteredReady) {
      encounteredNonReadyBeforeReady = true;
    } else {
      gapAfterReady = true;
    }
  }

  if (encounteredReady && encounteredNonReadyBeforeReady) {
    sortReadyTabsAreAtFront = false;
  }

  const sortReadyIdsByRemainingTime = sortReadyEntries
    .slice()
    .sort((a, b) => a.remainingTime - b.remainingTime)
    .map((entry) => entry.id);

  if (sortReadyIdsInCurrentOrder.length >= 2) {
    sortReadyTabsAreOutOfOrder = !areTabIdListsEqual(
      sortReadyIdsInCurrentOrder,
      sortReadyIdsByRemainingTime,
    );
  }

  const allSortableTabsReady = sortableTabCount > 1 && sortReadyTabCount === sortableTabCount;
  const currentOrderMatchesTarget =
    allSortableTabsReady && areTabIdListsEqual(orderedIdsWithRecords, sortReadyIdsByRemainingTime);

  return {
    counts: {
      tracked: trackedTabCount,
      sortReady: sortReadyTabCount,
    },
    sortReadyTabs: {
      contiguous: sortReadyTabsAreContiguous,
      atFront: sortReadyTabsAreAtFront,
      outOfOrder: sortReadyTabsAreOutOfOrder,
    },
    backgroundTabs: {
      haveStaleRemainingTime: backgroundTabsHaveStaleRemainingTime,
    },
    order: {
      allSortableTabsReady,
      currentOrderMatchesTarget,
    },
  };
}
