import { TAB_STATES } from './constants.js';
import { isFiniteNumber } from './utils.js';

export function hasFreshRemainingTime(record) {
  if (!record) return false;
  if (record.status !== TAB_STATES.UNSUSPENDED) return false;
  if (record.remainingTimeMayBeStale) return false;
  const remainingTime = record?.videoDetails?.remainingTime;
  return isFiniteNumber(remainingTime);
}
