export function hasFreshRemainingTime(record) {
  if (!record || record.remainingTimeMayBeStale) return false;
  const remainingTime = record?.videoDetails?.remainingTime;
  return typeof remainingTime === 'number' && isFinite(remainingTime);
}

export function countTabsReadyForSorting(tabRecords) {
  return Object.values(tabRecords).filter((record) => hasFreshRemainingTime(record)).length;
}

export function areReadyTabsContiguous(tabRecords) {
  const readyRecords = Object.values(tabRecords)
    .filter((record) => hasFreshRemainingTime(record))
    .sort((a, b) => a.index - b.index);

  if (readyRecords.length < 2) return true;

  for (let i = 1; i < readyRecords.length; i += 1) {
    if (!Number.isFinite(readyRecords[i].index) || !Number.isFinite(readyRecords[i - 1].index)) continue;
    if (readyRecords[i].index !== readyRecords[i - 1].index + 1) return false;
  }

  return true;
}

export function areReadyTabsAtFront(tabRecords) {
  const records = Object.values(tabRecords);
  const readyRecords = records
    .filter((record) => hasFreshRemainingTime(record))
    .sort((a, b) => a.index - b.index);

  if (readyRecords.length === 0) return true;

  const firstReady = readyRecords[0];
  if (!Number.isFinite(firstReady.index)) return true;

  for (const record of records) {
    if (!Number.isFinite(record?.index)) continue;
    if (record.index < firstReady.index) {
      const isReady = hasFreshRemainingTime(record);
      if (!isReady) return false;
    }
  }

  return true;
}

export function areRecordsWithKnownDurationOutOfOrder(tabRecords) {
  const records = Object.values(tabRecords);
  if (records.length === 0) return false;

  const recordsWithRemainingTime = records.map((record) => {
    const remainingTime = record?.videoDetails?.remainingTime;
    const remaining = hasFreshRemainingTime(record) ? remainingTime : null;
    return { id: record.id, index: record.index, remaining };
  });

  const currentRecordsWithKnownDurationOrder = recordsWithRemainingTime
    .filter((item) => item.remaining !== null)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.id);

  const expectedRecordsWithKnownDurationOrder = recordsWithRemainingTime
    .filter((item) => item.remaining !== null)
    .sort((a, b) => a.remaining - b.remaining)
    .map((item) => item.id);

  if (currentRecordsWithKnownDurationOrder.length < 2) return false;
  if (currentRecordsWithKnownDurationOrder.length !== expectedRecordsWithKnownDurationOrder.length)
    return true;
  return !currentRecordsWithKnownDurationOrder.every(
    (id, i) => id === expectedRecordsWithKnownDurationOrder[i],
  );
}

function allRecordsHaveKnownRemainingTime(tabRecords) {
  return Object.values(tabRecords).every((record) => hasFreshRemainingTime(record));
}

export function allRecordsHaveKnownRemainingTimeAndAreInOrder(tabRecords) {
  const records = Object.values(tabRecords);
  if (records.length <= 1) return false;
  if (!allRecordsHaveKnownRemainingTime(tabRecords)) return false;

  const currentOrder = records.slice().sort((a, b) => a.index - b.index).map((record) => record.id);
  const expectedOrder = records
    .slice()
    .sort((a, b) => a.videoDetails.remainingTime - b.videoDetails.remainingTime)
    .map((record) => record.id);

  return (
    currentOrder.length === expectedOrder.length &&
    currentOrder.every((id, i) => id === expectedOrder[i])
  );
}
