import { isFiniteNumber } from '../shared/guards.js';
import { TAB_STATES } from '../shared/tab-states.js';

export function hasReadyRemainingTime(record) {
  if (!record) return false;
  if (record.status !== TAB_STATES.UNSUSPENDED) return false;
  if (record.isRemainingTimeStale) return false;
  const remainingTime = record?.videoDetails?.remainingTime;
  return isFiniteNumber(remainingTime);
}
