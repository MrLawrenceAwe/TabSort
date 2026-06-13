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

function splitVideoReadiness(records) {
  return records.reduce(
    (groups, record) => {
      const entry = {
        id: record.id,
        remainingTime: hasReadyRemainingTime(record)
          ? record.videoDetails?.remainingTime ?? null
          : null,
      };
      if (entry.remainingTime === null) {
        groups.waitingIds.add(entry.id);
      } else {
        groups.readyEntries.push(entry);
      }
      return groups;
    },
    { readyEntries: [], waitingIds: new Set() },
  );
}

function buildPlannedVideoTabOrder(readyEntries, waitingIds, eligibleIdsInTabOrder) {
  const sortedReadyIds = readyEntries
    .slice()
    .sort((a, b) => a.remainingTime - b.remainingTime)
    .map((entry) => entry.id);
  const waitingIdsInCurrentOrder = eligibleIdsInTabOrder.filter((id) => waitingIds.has(id));
  return [...sortedReadyIds, ...waitingIdsInCurrentOrder];
}

function isEligibleVideoRecord(record) {
  return !record?.isLiveNow;
}

export function deriveSortPlan(records) {
  const trackedTabIdsInWindowOrder = deriveTabIdOrder(records);
  const movableRecords = records.filter((record) => !record.pinned);
  const eligibleVideoRecords = movableRecords.filter(isEligibleVideoRecord);
  const eligibleIdsInTabOrder = deriveTabIdOrder(eligibleVideoRecords);
  const { readyEntries, waitingIds } = splitVideoReadiness(eligibleVideoRecords);
  const readyVideoIds = new Set(readyEntries.map((entry) => entry.id));
  const readyVideoTabIdsInCurrentOrder = eligibleIdsInTabOrder.filter((tabId) =>
    readyVideoIds.has(tabId),
  );
  const readyVideoTabIdsByRemainingTime = readyEntries
    .slice()
    .sort((a, b) => a.remainingTime - b.remainingTime)
    .map((entry) => entry.id);
  const plannedVideoTabOrder = buildPlannedVideoTabOrder(
    readyEntries,
    waitingIds,
    eligibleIdsInTabOrder,
  );
  const allSortableVideosReady = waitingIds.size === 0;
  const currentVideoTabOrderMatchesPlan =
    eligibleIdsInTabOrder.length > 0 &&
    eligibleIdsInTabOrder.length === plannedVideoTabOrder.length &&
    eligibleIdsInTabOrder.every((id, index) => id === plannedVideoTabOrder[index]);

  return {
    trackedTabIdsInWindowOrder,
    plannedVideoTabOrder,
    eligibleVideoRecords,
    eligibleIdsInTabOrder,
    readyVideoTabIdsInCurrentOrder,
    readyVideoTabIdsByRemainingTime,
    allSortableVideosReady,
    isSortComplete: allSortableVideosReady && currentVideoTabOrderMatchesPlan,
  };
}
