import { TAB_STATES } from '../shared/constants.js';
import { isFiniteNumber } from '../shared/utils.js';
import { createEmptySortSummary } from '../shared/sort-summary.js';
import { broadcastSnapshotUpdate } from './tab-snapshot.js';
import { trackingState } from './tracking-state.js';

function areIdListsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]) !== String(b[i])) return false;
  }
  return true;
}

function deriveTabOrder(records) {
  const resolveIndex = (record) =>
    (isFiniteNumber(record?.index) ? record.index : Number.MAX_SAFE_INTEGER);
  return records
    .slice()
    .sort((a, b) => {
      const indexDelta = resolveIndex(a) - resolveIndex(b);
      if (indexDelta !== 0) return indexDelta;
      return a.id - b.id;
    })
    .map((record) => record.id);
}

export function hasReadyRemainingTime(record) {
  if (!record) return false;
  if (record.status !== TAB_STATES.UNSUSPENDED) return false;
  if (record.isRemainingTimeStale) return false;
  const remainingTime = record?.videoDetails?.remainingTime;
  return isFiniteNumber(remainingTime);
}

function buildRemainingTimeEntries(records) {
  return records.map((record) => ({
    id: record.id,
    remainingTime: hasReadyRemainingTime(record)
      ? record.videoDetails?.remainingTime ?? null
      : null,
  }));
}

function buildTargetOrder(knownEntries, unknownEntries, currentOrder) {
  const sortedKnownIds = knownEntries
    .slice()
    .sort((a, b) => a.remainingTime - b.remainingTime)
    .map((entry) => entry.id);

  const unknownIds = new Set(unknownEntries.map((entry) => entry.id));
  const unknownIdsInCurrentOrder = currentOrder.filter((id) => unknownIds.has(id));

  return [...sortedKnownIds, ...unknownIdsInCurrentOrder];
}

function isRecordSortableByRemainingTime(record) {
  return !record?.isLiveStream;
}

function buildSortSummary(records, currentOrder) {
  if (!Array.isArray(records) || records.length === 0) {
    return createEmptySortSummary();
  }

  const recordMap = new Map(records.map((record) => [record.id, record]));
  const trackedTabCount = records.length;

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

  for (const tabId of currentOrder) {
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

  const readyIdsByRemaining = readyEntries
    .slice()
    .sort((a, b) => a.remainingTime - b.remainingTime)
    .map((entry) => entry.id);

  if (readyIdsInCurrentOrder.length >= 2) {
    readyTabsAreOutOfOrder = !areIdListsEqual(readyIdsInCurrentOrder, readyIdsByRemaining);
  }

  const allRemainingTimesKnown = trackedTabCount > 1 && readyTabCount === trackedTabCount;
  const allSorted =
    allRemainingTimesKnown && areIdListsEqual(orderedIdsWithRecords, readyIdsByRemaining);

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
      allRemainingTimesKnown,
      allSorted,
    },
  };
}

function deriveSortState(records) {
  const visibleOrder = deriveTabOrder(records);
  const actionableRecords = records.filter((record) => !record.pinned);
  const sortableRecords = actionableRecords.filter(isRecordSortableByRemainingTime);
  const sortableOrder = deriveTabOrder(sortableRecords);
  const remainingTimeEntries = buildRemainingTimeEntries(sortableRecords);

  const knownRemainingEntries = remainingTimeEntries.filter((entry) => entry.remainingTime !== null);
  const unknownRemainingEntries = remainingTimeEntries.filter((entry) => entry.remainingTime === null);

  const targetOrder = buildTargetOrder(
    knownRemainingEntries,
    unknownRemainingEntries,
    sortableOrder,
  );
  const allRemainingTimesKnown = unknownRemainingEntries.length === 0;

  const alreadySorted =
    sortableOrder.length > 0 &&
    sortableOrder.length === targetOrder.length &&
    sortableOrder.every((id, index) => id === targetOrder[index]);

  const sortSummary = buildSortSummary(sortableRecords, sortableOrder);
  sortSummary.counts.tracked = records.length;

  return {
    visibleOrder,
    targetOrder,
    allRemainingTimesKnown,
    alreadySorted,
    sortSummary,
  };
}

function applyDerivedSortState({
  visibleOrder,
  targetOrder,
  allRemainingTimesKnown,
  alreadySorted,
  sortSummary,
}) {
  trackingState.targetOrder = targetOrder;
  trackingState.visibleOrder = visibleOrder;
  trackingState.allSortableTabsSorted = allRemainingTimesKnown && alreadySorted;
  trackingState.sortSummary = sortSummary
    ? {
        counts: { ...sortSummary.counts },
        readyTabs: { ...sortSummary.readyTabs },
        backgroundTabs: { ...sortSummary.backgroundTabs },
        order: { ...sortSummary.order },
      }
    : null;

  broadcastSnapshotUpdate();
}

export function recomputeSortState() {
  const records = Object.values(trackingState.trackedTabsById);
  const derivedState = deriveSortState(records);
  applyDerivedSortState(derivedState);
}
