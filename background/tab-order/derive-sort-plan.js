import { isFiniteNumber } from '../../shared/guards.js';
import { hasReadyRemainingTime } from '../sort-readiness.js';

export function areTabIdListsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]) !== String(b[i])) return false;
  }
  return true;
}

function deriveTabIdOrder(records) {
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

function buildRemainingTimeEntries(records) {
  return records.map((record) => ({
    id: record.id,
    remainingTime: hasReadyRemainingTime(record)
      ? record.videoDetails?.remainingTime ?? null
      : null,
  }));
}

function buildTargetVideoOrder(knownEntries, unknownEntries, currentEligibleVideoIds) {
  const sortedKnownIds = knownEntries
    .slice()
    .sort((a, b) => a.remainingTime - b.remainingTime)
    .map((entry) => entry.id);

  const unknownIds = new Set(unknownEntries.map((entry) => entry.id));
  const unknownIdsInCurrentOrder = currentEligibleVideoIds.filter((id) => unknownIds.has(id));

  return [...sortedKnownIds, ...unknownIdsInCurrentOrder];
}

function isEligibleVideoRecord(record) {
  return !record?.isLiveNow;
}

export function deriveSortPlan(records) {
  const visibleTabIds = deriveTabIdOrder(records);
  const movableRecords = records.filter((record) => !record.pinned);
  const eligibleVideoRecords = movableRecords.filter(isEligibleVideoRecord);
  const currentEligibleVideoIds = deriveTabIdOrder(eligibleVideoRecords);
  const remainingTimeEntries = buildRemainingTimeEntries(eligibleVideoRecords);
  const knownRemainingEntries = remainingTimeEntries.filter((entry) => entry.remainingTime !== null);
  const unknownRemainingEntries = remainingTimeEntries.filter((entry) => entry.remainingTime === null);
  const targetVideoOrder = buildTargetVideoOrder(
    knownRemainingEntries,
    unknownRemainingEntries,
    currentEligibleVideoIds,
  );
  const allEligibleVideosReady = unknownRemainingEntries.length === 0;
  const currentVideoOrderMatchesTarget =
    currentEligibleVideoIds.length > 0 &&
    currentEligibleVideoIds.length === targetVideoOrder.length &&
    currentEligibleVideoIds.every((id, index) => id === targetVideoOrder[index]);

  return {
    visibleTabIds,
    targetVideoOrder,
    eligibleVideoRecords,
    currentEligibleVideoIds,
    allEligibleVideosReady,
    currentOrderMatchesTarget: allEligibleVideosReady && currentVideoOrderMatchesTarget,
  };
}
