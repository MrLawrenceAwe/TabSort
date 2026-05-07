import { TAB_STATES } from './tab-states.js';
import { isFiniteNumber } from './guards.js';

export const RECENTLY_UNSUSPENDED_MS = 5000;
export const RECENT_WATCH_TRANSITION_MS = 5000;
export const MEDIA_WAIT_GRACE_MS = 15000;
export const LOADING_GRACE_MS = 5000;

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

function isRecentTimestamp(timestamp, nowMs, graceMs) {
  return typeof timestamp === 'number' && nowMs - timestamp < graceMs;
}

function hasRecentWatchTransition(tabRecord, nowMs) {
  return isRecentTimestamp(
    tabRecord.transitionStartedAt,
    nowMs,
    RECENT_WATCH_TRANSITION_MS,
  );
}

function isRecentlyUnsuspended(tabRecord, nowMs) {
  return isRecentTimestamp(
    tabRecord.unsuspendedTimestamp,
    nowMs,
    RECENTLY_UNSUSPENDED_MS,
  );
}

function canMediaStillSettle(tabRecord, nowMs) {
  return isRecentTimestamp(tabRecord.mediaWaitStartedAt, nowMs, MEDIA_WAIT_GRACE_MS);
}

function determineActionForMissingRemainingTime(tabRecord, transitionCanSettle, nowMs) {
  switch (tabRecord.status) {
    case TAB_STATES.UNSUSPENDED:
      if (tabRecord.isActiveTab) {
        if (tabRecord.pageRuntimeReady && !tabRecord.pageMediaReady) {
          return canMediaStillSettle(tabRecord, nowMs)
            ? USER_ACTIONS.WAIT_FOR_VIDEO_DATA
            : USER_ACTIONS.RELOAD_TAB;
        }
        return transitionCanSettle && !tabRecord.pageRuntimeReady
          ? USER_ACTIONS.NONE
          : USER_ACTIONS.RELOAD_TAB;
      }
      if (transitionCanSettle && !tabRecord.pageRuntimeReady) return USER_ACTIONS.NONE;
      if (!tabRecord.pageRuntimeReady) return USER_ACTIONS.RELOAD_TAB;
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
  const hasRemainingTime = isFiniteNumber(tabRecord?.videoDetails?.remainingTime);
  const transitionCanSettle =
    isRecentlyUnsuspended(tabRecord, nowMs) || hasRecentWatchTransition(tabRecord, nowMs);

  if (!hasRemainingTime) {
    return determineActionForMissingRemainingTime(tabRecord, transitionCanSettle, nowMs);
  }

  if (tabRecord?.isRemainingTimeStale) {
    if (!tabRecord.pageRuntimeReady || tabRecord.isActiveTab) {
      return determineActionForMissingRemainingTime(tabRecord, transitionCanSettle, nowMs);
    }
    return USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME;
  }

  return USER_ACTIONS.NONE;
}

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
  return shouldPollRecord(record, options) && record.status === TAB_STATES.UNSUSPENDED;
}

export function getUserActionLabel(action) {
  return USER_ACTION_LABELS[action] ?? '';
}
