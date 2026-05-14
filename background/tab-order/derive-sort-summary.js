import { createEmptySortSummary } from '../../shared/sort-summary.js';
import { hasReadyRemainingTime } from '../sort-readiness.js';
import { areTabIdListsEqual } from './derive-sort-plan.js';

export function deriveSortSummary({
  trackedRecords,
  eligibleVideoRecords,
  eligibleVideoTabIdsInCurrentOrder,
  readyVideoTabIdsInCurrentOrder,
  readyVideoTabIdsByRemainingTime,
}) {
  if (!Array.isArray(trackedRecords) || trackedRecords.length === 0) {
    return createEmptySortSummary();
  }

  const recordMap = new Map(eligibleVideoRecords.map((record) => [record.id, record]));
  const trackedTabCount = trackedRecords.length;
  const eligibleVideoCount = eligibleVideoRecords.length;

  let inactiveTabsHaveStaleRemainingTime = false;
  let sortReadyTabCount = 0;
  let sortReadyTabsAreContiguous = true;
  let sortReadyTabsAreAtFront = true;
  let sortReadyTabsAreOutOfOrder = false;

  const orderedIdsWithRecords = [];
  const readyIdsInCurrentOrder = readyVideoTabIdsInCurrentOrder || [];
  const readyIdsByRemainingTime = readyVideoTabIdsByRemainingTime || [];

  let encounteredReady = false;
  let encounteredNonReadyBeforeReady = false;
  let gapAfterReady = false;

  for (const tabId of eligibleVideoTabIdsInCurrentOrder) {
    const record = recordMap.get(tabId);
    if (!record) continue;
    orderedIdsWithRecords.push(tabId);

    if (record.remainingTimeStale && (!record.isActiveTab || record.isHidden)) {
      inactiveTabsHaveStaleRemainingTime = true;
    }

    const isReady = hasReadyRemainingTime(record);
    if (isReady) {
      sortReadyTabCount += 1;
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

  if (readyIdsInCurrentOrder.length >= 2) {
    sortReadyTabsAreOutOfOrder = !areTabIdListsEqual(
      readyIdsInCurrentOrder,
      readyIdsByRemainingTime,
    );
  }

  const allEligibleVideosReady = eligibleVideoCount > 1 && sortReadyTabCount === eligibleVideoCount;
  const readyTabsAlreadySorted =
    allEligibleVideosReady && areTabIdListsEqual(orderedIdsWithRecords, readyIdsByRemainingTime);

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
    inactiveTabs: {
      hasStaleRemainingTime: inactiveTabsHaveStaleRemainingTime,
    },
    order: {
      allEligibleVideosReady,
      readyTabsAlreadySorted,
    },
  };
}
