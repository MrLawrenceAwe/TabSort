import { isFiniteNumber } from '../guards.js';
import { TAB_LOAD_STATES } from './load-states.js';

export function hasRemainingTime(record) {
  return isFiniteNumber(record?.videoDetails?.remainingSeconds);
}

export function hasReadyRemainingTime(record) {
  if (!record || record.autoPreparationInProgress) return false;
  const canUseRecordedTime =
    record.loadState === TAB_LOAD_STATES.LOADED ||
    (record.loadState === TAB_LOAD_STATES.DISCARDED && record.hasAutoPreparedTime);
  if (!canUseRecordedTime) return false;
  if (record.remainingSecondsStale) return false;
  return hasRemainingTime(record);
}
