import { TAB_STATES } from './tab-states.js';
import { determineUserAction, USER_ACTIONS } from './tab-user-actions.js';

export function shouldPollRecord(record, { now = Date.now } = {}) {
  if (!record || record.isLiveNow) return false;

  const userAction = determineUserAction(record, { now });
  if (
    record.status === TAB_STATES.UNSUSPENDED &&
    record.isRemainingTimeStale &&
    (userAction === USER_ACTIONS.NONE || userAction === USER_ACTIONS.WAIT_FOR_VIDEO_DATA)
  ) {
    return true;
  }

  return record.status === TAB_STATES.LOADING && userAction === USER_ACTIONS.WAIT_FOR_LOAD;
}

export function shouldRefreshRecordMetrics(record, options = {}) {
  if (!record || record.isLiveNow || record.status !== TAB_STATES.UNSUSPENDED) return false;
  if (shouldPollRecord(record, options)) return true;
  return Boolean(record.isRemainingTimeStale && record.isActiveTab && !record.isHidden);
}
