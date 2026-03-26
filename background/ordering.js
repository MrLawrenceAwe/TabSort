import { createEmptyReadinessMetrics } from '../shared/readiness.js';
import { hasFreshRemainingTime } from '../shared/tab-metrics.js';
import { isFiniteNumber } from '../shared/utils.js';
import { backgroundState } from './state.js';

function cloneRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    videoDetails: record.videoDetails ? { ...record.videoDetails } : null,
  };
}

function areIdListsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]) !== String(b[i])) return false;
  }
  return true;
}

export function buildTabSnapshot() {
  const records = Object.fromEntries(
    Object.entries(backgroundState.watchTabsById).map(([id, record]) => [
      id,
      cloneRecord(record),
    ]),
  );

  return {
    watchTabsById: records,
    watchTabIdsByRemaining: [
      ...backgroundState.watchTabIdsByRemaining,
    ],
    watchTabIdsByIndex: [
      ...backgroundState.watchTabIdsByIndex,
    ],
    isWindowSorted: backgroundState.isWindowSorted,
    readinessMetrics: {
      ...(backgroundState.readinessMetrics || createEmptyReadinessMetrics()),
    },
  };
}

function deriveCurrentOrder(records) {
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

function buildExpectedOrder(knownEntries, unknownEntries, currentOrder) {
  const knownDurationSortedIds = knownEntries
    .slice()
    .sort((a, b) => a.remainingTime - b.remainingTime)
    .map((entry) => entry.id);

  const unknownIds = new Set(unknownEntries.map((entry) => entry.id));
  const unknownIdsInCurrentOrder = currentOrder.filter((id) => unknownIds.has(id));

  return [...knownDurationSortedIds, ...unknownIdsInCurrentOrder];
}

function isRecordSortableByRemainingTime(record) {
  return !record?.isLiveStream;
}

function buildReadinessMetrics(records, currentOrder) {
  if (!Array.isArray(records) || records.length === 0) {
    return createEmptyReadinessMetrics();
  }

  const recordMap = new Map(records.map((record) => [record.id, record]));
  const trackedTabCount = records.length;

  let hasHiddenTabsWithStaleRemaining = false;
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

  for (const tabId of currentOrder) {
    const record = recordMap.get(tabId);
    if (!record) continue;
    orderedIdsWithRecords.push(tabId);

    if (record.isRemainingTimeStale && (!record.isActiveTab || record.isHidden)) {
      hasHiddenTabsWithStaleRemaining = true;
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
    hasHiddenTabsWithStaleRemaining,
    areReadyTabsContiguous,
    areReadyTabsAtFront,
    areReadyTabsOutOfOrder,
    areAllTimesKnown,
    areAllSorted,
  };
}

function computeDerivedOrderingState(records) {
  const displayOrder = deriveCurrentOrder(records);
  const actionableRecords = records.filter((record) => !record.pinned);
  const sortableRecords = actionableRecords.filter(isRecordSortableByRemainingTime);
  const currentOrder = deriveCurrentOrder(sortableRecords);
  const enriched = buildRemainingTimeEntries(sortableRecords);

  const knownDurationEntries = enriched.filter((entry) => entry.remainingTime !== null);
  const unknownDurationEntries = enriched.filter((entry) => entry.remainingTime === null);

  const expectedOrder = buildExpectedOrder(knownDurationEntries, unknownDurationEntries, currentOrder);
  const allRemainingTimesKnown = unknownDurationEntries.length === 0;

  const alreadyInExpectedOrder =
    currentOrder.length > 0 &&
    currentOrder.length === expectedOrder.length &&
    currentOrder.every((id, index) => id === expectedOrder[index]);

  return {
    displayOrder,
    currentOrder,
    expectedOrder,
    allRemainingTimesKnown,
    alreadyInExpectedOrder,
    readinessMetrics: buildReadinessMetrics(sortableRecords, currentOrder),
  };
}

function updateBackgroundOrderingState({
  displayOrder,
  expectedOrder,
  allRemainingTimesKnown,
  alreadyInExpectedOrder,
  readinessMetrics,
}) {
  backgroundState.watchTabIdsByRemaining = expectedOrder;
  backgroundState.watchTabIdsByIndex = displayOrder;
  backgroundState.isWindowSorted =
    allRemainingTimesKnown && alreadyInExpectedOrder;
  backgroundState.readinessMetrics = readinessMetrics ? { ...readinessMetrics } : null;

  broadcastTabSnapshot();
}

export function recomputeSorting() {
  const records = Object.values(backgroundState.watchTabsById);
  const derivedState = computeDerivedOrderingState(records);
  updateBackgroundOrderingState(derivedState);
}

export function broadcastTabSnapshot({ force = false } = {}) {
  try {
    const snapshot = buildTabSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === backgroundState.lastBroadcastSignature) return;
    backgroundState.lastBroadcastSignature = signature;

    chrome.runtime.sendMessage({ message: 'tabSnapshotUpdated', payload: snapshot }, () => {
      const err = chrome.runtime.lastError;
      if (err?.message && !/Receiving end/i.test(err.message)) {
        console.debug(`[TabSort] broadcast warning: ${err.message}`);
      }
    });
  } catch (_) {}
}
