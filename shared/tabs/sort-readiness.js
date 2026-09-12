import { isFiniteNumber } from '../guards.js';
import { TAB_LOAD_STATES } from './load-states.js';

export function hasReadyRemainingTime(record) {
  if (!record) return false;
  const canUseRecordedTime =
    record.loadState === TAB_LOAD_STATES.LOADED ||
    (record.loadState === TAB_LOAD_STATES.DISCARDED && record.autoPreparedRemainingTime);
  if (!canUseRecordedTime) return false;
  if (record.remainingSecondsStale) return false;
  const remainingSeconds = record?.videoDetails?.remainingSeconds;
  return isFiniteNumber(remainingSeconds);
}
