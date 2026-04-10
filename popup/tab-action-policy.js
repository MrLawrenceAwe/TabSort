import { LOADING_GRACE_MS, RECENTLY_UNSUSPENDED_MS, TAB_STATES } from '../shared/constants.js';
import { isFiniteNumber } from '../shared/guards.js';

export const USER_ACTIONS = {
  RELOAD_TAB: 'Reload tab',
  INTERACT_WITH_TAB: 'Interact with tab',
  WAIT_FOR_LOAD: 'Wait for tab to load',
  INTERACT_WITH_TAB_THEN_RELOAD: 'Interact with tab/Reload tab',
  VIEW_TAB_TO_REFRESH_TIME: 'View tab to refresh time',
  NO_ACTION: '',
};

function determineActionForMissingRemainingTime(tabRecord, recentlyUnsuspended) {
  switch (tabRecord.status) {
    case TAB_STATES.UNSUSPENDED:
      if (recentlyUnsuspended) return USER_ACTIONS.NO_ACTION;
      if (tabRecord.isActiveTab || !tabRecord.pageRuntimeReady) return USER_ACTIONS.RELOAD_TAB;
      return USER_ACTIONS.INTERACT_WITH_TAB_THEN_RELOAD;
    case TAB_STATES.SUSPENDED:
      return USER_ACTIONS.INTERACT_WITH_TAB;
    case TAB_STATES.LOADING:
      if (
        typeof tabRecord.loadingStartedAt === 'number' &&
        Date.now() - tabRecord.loadingStartedAt >= LOADING_GRACE_MS
      ) {
        return USER_ACTIONS.INTERACT_WITH_TAB;
      }
      return USER_ACTIONS.WAIT_FOR_LOAD;
    default:
      return USER_ACTIONS.NO_ACTION;
  }
}

export function determineUserAction(tabRecord) {
  if (tabRecord?.isLiveStream) {
    return USER_ACTIONS.NO_ACTION;
  }

  const hasRemainingTime = isFiniteNumber(tabRecord?.videoDetails?.remainingTime);
  const recentlyUnsuspended =
    tabRecord.unsuspendedTimestamp &&
    Date.now() - tabRecord.unsuspendedTimestamp < RECENTLY_UNSUSPENDED_MS;

  if (!hasRemainingTime) {
    return determineActionForMissingRemainingTime(tabRecord, recentlyUnsuspended);
  }

  if (tabRecord?.isRemainingTimeStale) {
    if (!tabRecord.pageRuntimeReady || tabRecord.isActiveTab) {
      return determineActionForMissingRemainingTime(tabRecord, recentlyUnsuspended);
    }
    return USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME;
  }

  return USER_ACTIONS.NO_ACTION;
}
