import { TAB_LOAD_STATES } from './load-states.js';
import {
  LOADING_GRACE_MS,
  MEDIA_WAIT_GRACE_MS,
  RECENTLY_LOADED_MS,
  RECENT_WATCH_TRANSITION_MS,
  canMediaStillSettle,
  canWatchTransitionStillSettle,
  hasRemainingTime,
} from './grace-periods.js';

export {
  LOADING_GRACE_MS,
  MEDIA_WAIT_GRACE_MS,
  RECENTLY_LOADED_MS,
  RECENT_WATCH_TRANSITION_MS,
};

export const TAB_GUIDANCE = {
  RELOAD_TAB: 'reloadTab',
  ACTIVATE_TAB: 'activateTab',
  WAIT_FOR_LOAD: 'waitForLoad',
  WAIT_FOR_VIDEO_DATA: 'waitForVideoData',
  VIEW_TAB_TO_LOAD_TIME: 'viewTabToLoadTime',
  VIEW_TAB_TO_REFRESH_TIME: 'viewTabToRefreshTime',
  NONE: 'none',
};

const TAB_GUIDANCE_LABELS = {
  [TAB_GUIDANCE.RELOAD_TAB]: 'Reload tab',
  [TAB_GUIDANCE.ACTIVATE_TAB]: 'View tab',
  [TAB_GUIDANCE.WAIT_FOR_LOAD]: 'Wait for tab to load',
  [TAB_GUIDANCE.WAIT_FOR_VIDEO_DATA]: 'Wait for video data',
  [TAB_GUIDANCE.VIEW_TAB_TO_LOAD_TIME]: 'View tab to read remaining time',
  [TAB_GUIDANCE.VIEW_TAB_TO_REFRESH_TIME]: 'View tab to update remaining time',
  [TAB_GUIDANCE.NONE]: '',
};

function resolveGuidanceForMissingRemainingTime(tabRecord, transitionCanSettle, nowMs) {
  switch (tabRecord.loadState) {
    case TAB_LOAD_STATES.LOADED:
      if (tabRecord.isActive) {
        if (tabRecord.contentScriptReady && !tabRecord.playbackMetricsReady) {
          return canMediaStillSettle(tabRecord, nowMs)
            ? TAB_GUIDANCE.WAIT_FOR_VIDEO_DATA
            : TAB_GUIDANCE.RELOAD_TAB;
        }
        return transitionCanSettle && !tabRecord.contentScriptReady
          ? TAB_GUIDANCE.NONE
          : TAB_GUIDANCE.RELOAD_TAB;
      }
      if (transitionCanSettle && !tabRecord.contentScriptReady) return TAB_GUIDANCE.NONE;
      if (!tabRecord.contentScriptReady) return TAB_GUIDANCE.RELOAD_TAB;
      return TAB_GUIDANCE.VIEW_TAB_TO_LOAD_TIME;
    case TAB_LOAD_STATES.DISCARDED:
      return TAB_GUIDANCE.ACTIVATE_TAB;
    case TAB_LOAD_STATES.LOADING:
      if (
        typeof tabRecord.loadingStartedAt === 'number' &&
        nowMs - tabRecord.loadingStartedAt >= LOADING_GRACE_MS
      ) {
        return tabRecord.isActive ? TAB_GUIDANCE.RELOAD_TAB : TAB_GUIDANCE.ACTIVATE_TAB;
      }
      return TAB_GUIDANCE.WAIT_FOR_LOAD;
    default:
      return TAB_GUIDANCE.NONE;
  }
}

export function determineTabGuidance(tabRecord, { now = Date.now } = {}) {
  if (tabRecord?.isLive) {
    return TAB_GUIDANCE.NONE;
  }

  const nowMs = now();
  const transitionCanSettle = canWatchTransitionStillSettle(tabRecord, nowMs);

  if (!hasRemainingTime(tabRecord)) {
    return resolveGuidanceForMissingRemainingTime(tabRecord, transitionCanSettle, nowMs);
  }

  if (tabRecord?.remainingSecondsStale) {
    if (!tabRecord.contentScriptReady || tabRecord.isActive) {
      return resolveGuidanceForMissingRemainingTime(tabRecord, transitionCanSettle, nowMs);
    }
    return TAB_GUIDANCE.VIEW_TAB_TO_REFRESH_TIME;
  }

  return TAB_GUIDANCE.NONE;
}

export function getTabGuidanceLabel(guidance) {
  return TAB_GUIDANCE_LABELS[guidance] ?? '';
}
