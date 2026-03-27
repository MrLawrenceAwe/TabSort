import { isFiniteNumber } from '../shared/guards.js';
import { createEmptyReadinessMetrics } from '../shared/readiness.js';
import { hasFreshRemainingTime } from '../shared/tab-metrics.js';
import { backgroundStore } from './background-store.js';
import { broadcastSnapshotUpdate } from './tab-snapshot.js';

function areIdListsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]) !== String(b[i])) return false;
  }
  return true;
}

function deriveTabOrder(records) {
  const resolveIndex = (record) => (isFiniteNumber(record?.index) ? record.index : Number.MAX_SAFE_INTEGER);
  return records
    .slice()
    .sort((a, b) => {
      const indexDelta = resolveIndex(a) - resolveIndex(b);
      if (indexDelta !== 0) return indexDelta;
      return a.id - b.id;
    })
    .map((record) => record.id);
}

function buildRemainingTimeEntries(records) {
  return records.map((record) => {
    const value = hasFreshRemainingTime(record)
      ? record.videoDetails?.remainingTime ?? null
      : null;
    return { id: record.id, remainingTime: value };
  });
}

function buildTargetSortOrder(knownEntries, unknownEntries, currentOrderTabIds) {
  const knownRemainingSortedTabIds = knownEntries
    .slice()
    .sort((a, b) => a.remainingTime - b.remainingTime)
    .map((entry) => entry.id);

  const unknownIds = new Set(unknownEntries.map((entry) => entry.id));
  const unknownIdsInCurrentOrder = currentOrderTabIds.filter((id) => unknownIds.has(id));

  return [...knownRemainingSortedTabIds, ...unknownIdsInCurrentOrder];
}

function isRecordSortableByRemainingTime(record) {
  return !record?.isLiveStream;
}

function buildReadinessMetrics(records, currentOrderTabIds) {
  if (!Array.isArray(records) || records.length === 0) {
    return createEmptyReadinessMetrics();
  }

  const recordMap = new Map(records.map((record) => [record.id, record]));
  const trackedTabCount = records.length;

  let hasBackgroundTabsWithStaleRemaining = false;
  let readyTabCount = 0;
  let areReadyTabsContiguous = true;
  let areReadyTabsAtFront = true;
  let areReadyTabsOutOfOrder = false;

  const readyIdsInCurrentOrder = [];
  const readyEntries = [];
  const orderedIdsWithRecords = [];

  let encounteredReady = false;
  let encounteredNonReadyBeforeReady = false;
  let gapAfterReady = false;

  for (const tabId of currentOrderTabIds) {
    const record = recordMap.get(tabId);
    if (!record) continue;
    orderedIdsWithRecords.push(tabId);

    if (record.isRemainingTimeStale && (!record.isActiveTab || record.isHidden)) {
      hasBackgroundTabsWithStaleRemaining = true;
    }

    const isReady = hasFreshRemainingTime(record);
    if (isReady) {
      readyTabCount += 1;
      readyIdsInCurrentOrder.push(record.id);
      readyEntries.push({ id: record.id, remaining: record.videoDetails?.remainingTime || 0 });
      encounteredReady = true;
      if (gapAfterReady) areReadyTabsContiguous = false;
      continue;
    }

    if (!encounteredReady) {
      encounteredNonReadyBeforeReady = true;
    } else {
      gapAfterReady = true;
    }
  }

  if (encounteredReady && encounteredNonReadyBeforeReady) {
    areReadyTabsAtFront = false;
  }

  const readyIdsByRemaining = readyEntries
    .slice()
    .sort((a, b) => a.remaining - b.remaining)
    .map((entry) => entry.id);

  if (readyIdsInCurrentOrder.length >= 2) {
    areReadyTabsOutOfOrder = !areIdListsEqual(readyIdsInCurrentOrder, readyIdsByRemaining);
  }

  const areAllTimesKnown = trackedTabCount > 1 && readyTabCount === trackedTabCount;
  const areAllSorted =
    areAllTimesKnown && areIdListsEqual(orderedIdsWithRecords, readyIdsByRemaining);

  return {
    trackedTabCount,
    readyTabCount,
    hasBackgroundTabsWithStaleRemaining,
    areReadyTabsContiguous,
    areReadyTabsAtFront,
    areReadyTabsOutOfOrder,
    areAllTimesKnown,
    areAllSorted,
  };
}

function deriveSortState(records) {
  const visibleTabOrderTabIds = deriveTabOrder(records);
  const actionableRecords = records.filter((record) => !record.pinned);
  const sortableRecords = actionableRecords.filter(isRecordSortableByRemainingTime);
  const currentSortableOrderTabIds = deriveTabOrder(sortableRecords);
  const remainingTimeEntries = buildRemainingTimeEntries(sortableRecords);

  const knownRemainingEntries = remainingTimeEntries.filter((entry) => entry.remainingTime !== null);
  const unknownRemainingEntries = remainingTimeEntries.filter((entry) => entry.remainingTime === null);

  const targetSortOrderTabIds = buildTargetSortOrder(
    knownRemainingEntries,
    unknownRemainingEntries,
    currentSortableOrderTabIds,
  );
  const areAllRemainingTimesKnown = unknownRemainingEntries.length === 0;

  const alreadyInTargetOrder =
    currentSortableOrderTabIds.length > 0 &&
    currentSortableOrderTabIds.length === targetSortOrderTabIds.length &&
    currentSortableOrderTabIds.every((id, index) => id === targetSortOrderTabIds[index]);

  return {
    visibleTabOrderTabIds,
    targetSortOrderTabIds,
    areAllRemainingTimesKnown,
    alreadyInTargetOrder,
    readinessMetrics: buildReadinessMetrics(sortableRecords, currentSortableOrderTabIds),
  };
}

function applyDerivedSortState({
  visibleTabOrderTabIds,
  targetSortOrderTabIds,
  areAllRemainingTimesKnown,
  alreadyInTargetOrder,
  readinessMetrics,
}) {
  backgroundStore.targetSortOrderTabIds = targetSortOrderTabIds;
  backgroundStore.visibleTabOrderTabIds = visibleTabOrderTabIds;
  backgroundStore.areTrackedTabsSorted = areAllRemainingTimesKnown && alreadyInTargetOrder;
  backgroundStore.readinessMetrics = readinessMetrics ? { ...readinessMetrics } : null;

  broadcastSnapshotUpdate();
}

export function recomputeSortState() {
  const records = Object.values(backgroundStore.trackedVideoTabsById);
  const derivedState = deriveSortState(records);
  applyDerivedSortState(derivedState);
}
