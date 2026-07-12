import { isFiniteNumber } from '../../shared/guards.js';
import { TAB_LOAD_STATES } from '../../shared/tabs/load-states.js';

export function hasReadyRemainingTime(record) {
  if (!record) return false;
  if (record.loadState !== TAB_LOAD_STATES.UNSUSPENDED) return false;
  if (record.remainingTimeStale) return false;
  const remainingTime = record?.videoDetails?.remainingTime;
  return isFiniteNumber(remainingTime);
}
