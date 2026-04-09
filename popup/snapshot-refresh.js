import { TAB_STATES } from '../shared/constants.js';
import { determineUserAction, USER_ACTIONS } from './tab-row.js';

export function shouldAutoRefreshRecord(record) {
  if (!record || record.isLiveStream) return false;

  const userAction = determineUserAction(record);
  if (
    record.status === TAB_STATES.UNSUSPENDED &&
    record.isRemainingTimeStale &&
    userAction === USER_ACTIONS.NO_ACTION
  ) {
    return true;
  }

  return record.status === TAB_STATES.LOADING && userAction === USER_ACTIONS.WAIT_FOR_LOAD;
}

export function shouldAutoRefreshSnapshot(snapshot) {
  const trackedTabsById = snapshot?.trackedTabsById;
  if (!trackedTabsById || typeof trackedTabsById !== 'object') return false;
  return Object.values(trackedTabsById).some((record) => shouldAutoRefreshRecord(record));
}
