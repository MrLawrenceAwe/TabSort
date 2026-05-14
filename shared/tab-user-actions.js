import { TAB_STATES } from './tab-states.js';
import {
  LOADING_GRACE_MS,
  MEDIA_WAIT_GRACE_MS,
  RECENTLY_UNSUSPENDED_MS,
  RECENT_WATCH_TRANSITION_MS,
  canMediaStillSettle,
  canWatchTransitionStillSettle,
  hasRemainingTime,
} from './tab-resolution-state.js';

export {
  LOADING_GRACE_MS,
  MEDIA_WAIT_GRACE_MS,
  RECENTLY_UNSUSPENDED_MS,
  RECENT_WATCH_TRANSITION_MS,
};

export const USER_ACTIONS = {
  RELOAD_TAB: 'reloadTab',
  FOCUS_TAB: 'focusTab',
  WAIT_FOR_LOAD: 'waitForLoad',
  WAIT_FOR_VIDEO_DATA: 'waitForVideoData',
  VIEW_TAB_TO_LOAD_TIME: 'viewTabToLoadTime',
  VIEW_TAB_TO_REFRESH_TIME: 'viewTabToRefreshTime',
  NONE: 'none',
};

const USER_ACTION_LABELS = {
  [USER_ACTIONS.RELOAD_TAB]: 'Reload tab',
  [USER_ACTIONS.FOCUS_TAB]: 'Focus tab',
  [USER_ACTIONS.WAIT_FOR_LOAD]: 'Wait for tab to load',
  [USER_ACTIONS.WAIT_FOR_VIDEO_DATA]: 'Wait for video data',
  [USER_ACTIONS.VIEW_TAB_TO_LOAD_TIME]: 'View tab to load time',
  [USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME]: 'View tab to refresh time',
  [USER_ACTIONS.NONE]: '',
};

function determineActionForMissingRemainingTime(tabRecord, transitionCanSettle, nowMs) {
  switch (tabRecord.status) {
    case TAB_STATES.UNSUSPENDED:
      if (tabRecord.isActiveTab) {
        if (tabRecord.contentScriptReady && !tabRecord.videoElementReady) {
          return canMediaStillSettle(tabRecord, nowMs)
            ? USER_ACTIONS.WAIT_FOR_VIDEO_DATA
            : USER_ACTIONS.RELOAD_TAB;
        }
        return transitionCanSettle && !tabRecord.contentScriptReady
          ? USER_ACTIONS.NONE
          : USER_ACTIONS.RELOAD_TAB;
      }
      if (transitionCanSettle && !tabRecord.contentScriptReady) return USER_ACTIONS.NONE;
      if (!tabRecord.contentScriptReady) return USER_ACTIONS.RELOAD_TAB;
      return USER_ACTIONS.VIEW_TAB_TO_LOAD_TIME;
    case TAB_STATES.SUSPENDED:
      return USER_ACTIONS.FOCUS_TAB;
    case TAB_STATES.LOADING:
      if (
        typeof tabRecord.loadingStartedAt === 'number' &&
        nowMs - tabRecord.loadingStartedAt >= LOADING_GRACE_MS
      ) {
        return tabRecord.isActiveTab ? USER_ACTIONS.RELOAD_TAB : USER_ACTIONS.FOCUS_TAB;
      }
      return USER_ACTIONS.WAIT_FOR_LOAD;
    default:
      return USER_ACTIONS.NONE;
  }
}

export function determineUserAction(tabRecord, { now = Date.now } = {}) {
  if (tabRecord?.isLiveNow) {
    return USER_ACTIONS.NONE;
  }

  const nowMs = now();
  const transitionCanSettle = canWatchTransitionStillSettle(tabRecord, nowMs);

  if (!hasRemainingTime(tabRecord)) {
    return determineActionForMissingRemainingTime(tabRecord, transitionCanSettle, nowMs);
  }

  if (tabRecord?.remainingTimeNeedsRefresh) {
    if (!tabRecord.contentScriptReady || tabRecord.isActiveTab) {
      return determineActionForMissingRemainingTime(tabRecord, transitionCanSettle, nowMs);
    }
    return USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME;
  }

  return USER_ACTIONS.NONE;
}

export function getUserActionLabel(action) {
  return USER_ACTION_LABELS[action] ?? '';
}
