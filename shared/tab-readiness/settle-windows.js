import { isFiniteNumber } from '../guards.js';

export const RECENTLY_UNSUSPENDED_MS = 5000;
export const RECENT_WATCH_TRANSITION_MS = 5000;
export const MEDIA_WAIT_GRACE_MS = 15000;
export const LOADING_GRACE_MS = 5000;

export function hasRemainingTime(tabRecord) {
  return isFiniteNumber(tabRecord?.videoDetails?.remainingTime);
}

export function isRecentTimestamp(timestamp, nowMs, graceMs) {
  return typeof timestamp === 'number' && nowMs - timestamp < graceMs;
}

export function hasRecentWatchTransition(tabRecord, nowMs) {
  return isRecentTimestamp(
    tabRecord?.transitionStartedAt,
    nowMs,
    RECENT_WATCH_TRANSITION_MS,
  );
}

export function isRecentlyUnsuspended(tabRecord, nowMs) {
  return isRecentTimestamp(
    tabRecord?.unsuspendedTimestamp,
    nowMs,
    RECENTLY_UNSUSPENDED_MS,
  );
}

export function canMediaStillSettle(tabRecord, nowMs) {
  return isRecentTimestamp(tabRecord?.videoWaitStartedAt, nowMs, MEDIA_WAIT_GRACE_MS);
}

export function canLoadingStillSettle(tabRecord, nowMs) {
  return isRecentTimestamp(tabRecord?.loadingStartedAt, nowMs, LOADING_GRACE_MS);
}

export function canWatchTransitionStillSettle(tabRecord, nowMs) {
  return isRecentlyUnsuspended(tabRecord, nowMs) || hasRecentWatchTransition(tabRecord, nowMs);
}
