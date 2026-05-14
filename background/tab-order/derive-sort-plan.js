import { isFiniteNumber } from '../../shared/guards.js';
import { hasReadyRemainingTime } from '../remaining-time-readiness.js';

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

function buildTargetVideoTabOrder(knownEntries, unknownEntries, eligibleIdsInTabOrder) {
  const sortedKnownIds = knownEntries
    .slice()
    .sort((a, b) => a.remainingTime - b.remainingTime)
    .map((entry) => entry.id);

  const unknownIds = new Set(unknownEntries.map((entry) => entry.id));
  const unknownIdsInCurrentOrder = eligibleIdsInTabOrder.filter((id) => unknownIds.has(id));

  return [...sortedKnownIds, ...unknownIdsInCurrentOrder];
}

function isEligibleVideoRecord(record) {
  return !record?.isLiveNow;
}

export function deriveSortPlan(records) {
  const trackedTabIdsInWindowOrder = deriveTabIdOrder(records);
  const movableRecords = records.filter((record) => !record.pinned);
  const eligibleVideoRecords = movableRecords.filter(isEligibleVideoRecord);
  const eligibleIdsInTabOrder = deriveTabIdOrder(eligibleVideoRecords);
  const remainingTimeEntries = buildRemainingTimeEntries(eligibleVideoRecords);
  const knownRemainingEntries = remainingTimeEntries.filter((entry) => entry.remainingTime !== null);
  const unknownRemainingEntries = remainingTimeEntries.filter((entry) => entry.remainingTime === null);
  const readyVideoTabIdsInCurrentOrder = eligibleIdsInTabOrder.filter((tabId) =>
    knownRemainingEntries.some((entry) => entry.id === tabId),
  );
  const readyVideoTabIdsByRemainingTime = knownRemainingEntries
    .slice()
    .sort((a, b) => a.remainingTime - b.remainingTime)
    .map((entry) => entry.id);
  const targetVideoTabOrder = buildTargetVideoTabOrder(
    knownRemainingEntries,
    unknownRemainingEntries,
    eligibleIdsInTabOrder,
  );
  const allEligibleVideosReady = unknownRemainingEntries.length === 0;
  const currentVideoTabOrderMatchesPlan =
    eligibleIdsInTabOrder.length > 0 &&
    eligibleIdsInTabOrder.length === targetVideoTabOrder.length &&
    eligibleIdsInTabOrder.every((id, index) => id === targetVideoTabOrder[index]);

  return {
    trackedTabIdsInWindowOrder,
    targetVideoTabOrder,
    eligibleVideoRecords,
    eligibleIdsInTabOrder,
    readyVideoTabIdsInCurrentOrder,
    readyVideoTabIdsByRemainingTime,
    allEligibleVideosReady,
    allEligibleVideosSorted: allEligibleVideosReady && currentVideoTabOrderMatchesPlan,
  };
}
