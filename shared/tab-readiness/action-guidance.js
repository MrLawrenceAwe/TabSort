import { TAB_STATES } from '../tab-states.js';
import {
  LOADING_GRACE_MS,
  MEDIA_WAIT_GRACE_MS,
  RECENTLY_UNSUSPENDED_MS,
  RECENT_WATCH_TRANSITION_MS,
  canMediaStillSettle,
  canWatchTransitionStillSettle,
  hasRemainingTime,
} from './settle-windows.js';

export {
  LOADING_GRACE_MS,
  MEDIA_WAIT_GRACE_MS,
  RECENTLY_UNSUSPENDED_MS,
  RECENT_WATCH_TRANSITION_MS,
};

export const TAB_GUIDANCE = {
  RELOAD_TAB: 'reloadTab',
  FOCUS_TAB: 'focusTab',
  WAIT_FOR_LOAD: 'waitForLoad',
  WAIT_FOR_VIDEO_DATA: 'waitForVideoData',
  VIEW_TAB_TO_LOAD_TIME: 'viewTabToLoadTime',
  VIEW_TAB_TO_REFRESH_TIME: 'viewTabToRefreshTime',
  NONE: 'none',
};

const TAB_GUIDANCE_LABELS = {
  [TAB_GUIDANCE.RELOAD_TAB]: 'Reload tab',
  [TAB_GUIDANCE.FOCUS_TAB]: 'Focus tab',
  [TAB_GUIDANCE.WAIT_FOR_LOAD]: 'Wait for tab to load',
  [TAB_GUIDANCE.WAIT_FOR_VIDEO_DATA]: 'Wait for video data',
  [TAB_GUIDANCE.VIEW_TAB_TO_LOAD_TIME]: 'View tab to load time',
  [TAB_GUIDANCE.VIEW_TAB_TO_REFRESH_TIME]: 'View tab to refresh time',
  [TAB_GUIDANCE.NONE]: '',
};

function resolveGuidanceForMissingRemainingTime(tabRecord, transitionCanSettle, nowMs) {
  switch (tabRecord.status) {
    case TAB_STATES.UNSUSPENDED:
      if (tabRecord.isActiveTab) {
        if (tabRecord.pageRuntimeReady && !tabRecord.videoElementReady) {
          return canMediaStillSettle(tabRecord, nowMs)
            ? TAB_GUIDANCE.WAIT_FOR_VIDEO_DATA
            : TAB_GUIDANCE.RELOAD_TAB;
        }
        return transitionCanSettle && !tabRecord.pageRuntimeReady
          ? TAB_GUIDANCE.NONE
          : TAB_GUIDANCE.RELOAD_TAB;
      }
      if (transitionCanSettle && !tabRecord.pageRuntimeReady) return TAB_GUIDANCE.NONE;
      if (!tabRecord.pageRuntimeReady) return TAB_GUIDANCE.RELOAD_TAB;
      return TAB_GUIDANCE.VIEW_TAB_TO_LOAD_TIME;
    case TAB_STATES.SUSPENDED:
      return TAB_GUIDANCE.FOCUS_TAB;
    case TAB_STATES.LOADING:
      if (
        typeof tabRecord.loadingStartedAt === 'number' &&
        nowMs - tabRecord.loadingStartedAt >= LOADING_GRACE_MS
      ) {
        return tabRecord.isActiveTab ? TAB_GUIDANCE.RELOAD_TAB : TAB_GUIDANCE.FOCUS_TAB;
      }
      return TAB_GUIDANCE.WAIT_FOR_LOAD;
    default:
      return TAB_GUIDANCE.NONE;
  }
}

export function determineTabGuidance(tabRecord, { now = Date.now } = {}) {
  if (tabRecord?.isLiveNow) {
    return TAB_GUIDANCE.NONE;
  }

  const nowMs = now();
  const transitionCanSettle = canWatchTransitionStillSettle(tabRecord, nowMs);

  if (!hasRemainingTime(tabRecord)) {
    return resolveGuidanceForMissingRemainingTime(tabRecord, transitionCanSettle, nowMs);
  }

  if (tabRecord?.remainingTimeStale) {
    if (!tabRecord.pageRuntimeReady || tabRecord.isActiveTab) {
      return resolveGuidanceForMissingRemainingTime(tabRecord, transitionCanSettle, nowMs);
    }
    return TAB_GUIDANCE.VIEW_TAB_TO_REFRESH_TIME;
  }

  return TAB_GUIDANCE.NONE;
}

export function getTabGuidanceLabel(guidance) {
  return TAB_GUIDANCE_LABELS[guidance] ?? '';
}
