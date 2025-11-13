export function hasFreshRemainingTime(record) {
  if (!record || record.remainingTimeMayBeStale) return false;
  const remainingTime = record?.videoDetails?.remainingTime;
  return typeof remainingTime === 'number' && Number.isFinite(remainingTime);
}
