import { TAB_STATES } from '../shared/tab-states.js';
import { isFiniteNumber } from '../shared/guards.js';
import { LOADING_GRACE_MS, RECENTLY_UNSUSPENDED_MS } from './polling-config.js';

export const USER_ACTIONS = {
  RELOAD_TAB: 'reloadTab',
  FOCUS_TAB: 'focusTab',
  WAIT_FOR_LOAD: 'waitForLoad',
  FOCUS_THEN_RELOAD: 'focusThenReload',
  VIEW_TAB_TO_REFRESH_TIME: 'viewTabToRefreshTime',
  NONE: 'none',
};

export const USER_ACTION_LABELS = {
  [USER_ACTIONS.RELOAD_TAB]: 'Reload tab',
  [USER_ACTIONS.FOCUS_TAB]: 'Focus tab',
  [USER_ACTIONS.WAIT_FOR_LOAD]: 'Wait for tab to load',
  [USER_ACTIONS.FOCUS_THEN_RELOAD]: 'Focus tab/Reload tab',
  [USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME]: 'View tab to refresh time',
  [USER_ACTIONS.NONE]: '',
};

function determineActionForMissingRemainingTime(tabRecord, recentlyUnsuspended, nowMs) {
  switch (tabRecord.status) {
    case TAB_STATES.UNSUSPENDED:
      if (recentlyUnsuspended) return USER_ACTIONS.NONE;
      if (tabRecord.isActiveTab || !tabRecord.pageRuntimeReady) return USER_ACTIONS.RELOAD_TAB;
      return USER_ACTIONS.FOCUS_THEN_RELOAD;
    case TAB_STATES.SUSPENDED:
      return USER_ACTIONS.FOCUS_TAB;
    case TAB_STATES.LOADING:
      if (
        typeof tabRecord.loadingStartedAt === 'number' &&
        nowMs - tabRecord.loadingStartedAt >= LOADING_GRACE_MS
      ) {
        return USER_ACTIONS.FOCUS_TAB;
      }
      return USER_ACTIONS.WAIT_FOR_LOAD;
    default:
      return USER_ACTIONS.NONE;
  }
}

export function determineUserAction(tabRecord, { now = Date.now } = {}) {
  if (tabRecord?.isLiveStream) {
    return USER_ACTIONS.NONE;
  }

  const nowMs = now();
  const hasRemainingTime = isFiniteNumber(tabRecord?.videoDetails?.remainingTime);
  const recentlyUnsuspended =
    tabRecord.unsuspendedTimestamp &&
    nowMs - tabRecord.unsuspendedTimestamp < RECENTLY_UNSUSPENDED_MS;

  if (!hasRemainingTime) {
    return determineActionForMissingRemainingTime(tabRecord, recentlyUnsuspended, nowMs);
  }

  if (tabRecord?.isRemainingTimeStale) {
    if (!tabRecord.pageRuntimeReady || tabRecord.isActiveTab) {
      return determineActionForMissingRemainingTime(tabRecord, recentlyUnsuspended, nowMs);
    }
    return USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME;
  }

  return USER_ACTIONS.NONE;
}

export function getUserActionLabel(action) {
  return USER_ACTION_LABELS[action] ?? '';
}
