export function countTabsReadyForSorting(tabRecords) {
  return Object.values(tabRecords).filter((record) => {
    const rt = record?.videoDetails?.remainingTime;
    if (record?.remainingTimeMayBeStale) return false;
    return typeof rt === 'number' && isFinite(rt);
  }).length;
}

export function areReadyTabsContiguous(tabRecords) {
  const readyRecords = Object.values(tabRecords)
    .filter(
      (record) =>
        !record?.remainingTimeMayBeStale &&
        typeof record?.videoDetails?.remainingTime === 'number' &&
        isFinite(record.videoDetails.remainingTime),
    )
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
    .filter(
      (record) =>
        !record?.remainingTimeMayBeStale &&
        typeof record?.videoDetails?.remainingTime === 'number' &&
        isFinite(record.videoDetails.remainingTime),
    )
    .sort((a, b) => a.index - b.index);

  if (readyRecords.length === 0) return true;

  const firstReady = readyRecords[0];
  if (!Number.isFinite(firstReady.index)) return true;

  for (const record of records) {
    if (!Number.isFinite(record?.index)) continue;
    if (record.index < firstReady.index) {
      const isReady =
        !record?.remainingTimeMayBeStale &&
        typeof record?.videoDetails?.remainingTime === 'number' &&
        isFinite(record.videoDetails.remainingTime);
      if (!isReady) return false;
    }
  }

  return true;
}

export function areTabsWithKnownDurationOutOfOrder(tabRecords) {
  const records = Object.values(tabRecords);
  if (records.length === 0) return false;

  const recordsWithRemainingTime = records.map((record) => {
    const remainingTime = record?.videoDetails?.remainingTime;
    const remaining =
      !record?.remainingTimeMayBeStale && typeof remainingTime === 'number' && isFinite(remainingTime) ? remainingTime : null;
    return { id: record.id, index: record.index, remaining };
  });

  const currentTabsWithKnownDurationOrder = recordsWithRemainingTime
    .filter((item) => item.remaining !== null)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.id);

  const expectedTabsWithKnownDurationOrder = recordsWithRemainingTime
    .filter((item) => item.remaining !== null)
    .sort((a, b) => a.remaining - b.remaining)
    .map((item) => item.id);

  if (currentTabsWithKnownDurationOrder.length < 2) return false;
  if (currentTabsWithKnownDurationOrder.length !== expectedTabsWithKnownDurationOrder.length)
    return true;
  return !currentTabsWithKnownDurationOrder.every(
    (id, i) => id === expectedTabsWithKnownDurationOrder[i],
  );
}

function allRecordsHaveKnownRemainingTime(tabRecords) {
  return Object.values(tabRecords).every(
    (record) =>
      !record?.remainingTimeMayBeStale &&
      typeof record?.videoDetails?.remainingTime === 'number' &&
      isFinite(record.videoDetails.remainingTime),
  );
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
