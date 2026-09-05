import { isFiniteNumber } from '../guards.js';
import { TAB_LOAD_STATES } from './load-states.js';

export function hasReadyRemainingTime(record) {
  if (!record) return false;
  if (record.loadState !== TAB_LOAD_STATES.LOADED) return false;
  if (record.remainingSecondsStale) return false;
  const remainingSeconds = record?.videoDetails?.remainingSeconds;
  return isFiniteNumber(remainingSeconds);
}
