import { TAB_STATES } from './tab-states.js';
import {
  canLoadingStillSettle,
  canMediaStillSettle,
  canWatchTransitionStillSettle,
} from './tab-resolution-state.js';

export function shouldPollRecord(record, { now = Date.now } = {}) {
  if (!record || record.isLiveNow) return false;

  const nowMs = now();
  if (record.status === TAB_STATES.UNSUSPENDED && record.remainingTimeNeedsRefresh) {
    const waitingForContentScript =
      !record.contentScriptReady && canWatchTransitionStillSettle(record, nowMs);
    const waitingForVideoElement =
      record.isActiveTab &&
      record.contentScriptReady &&
      !record.videoElementReady &&
      canMediaStillSettle(record, nowMs);
    return waitingForContentScript || waitingForVideoElement;
  }

  return record.status === TAB_STATES.LOADING && canLoadingStillSettle(record, nowMs);
}

export function shouldRefreshRecordMetrics(record, options = {}) {
  if (!record || record.isLiveNow || record.status !== TAB_STATES.UNSUSPENDED) return false;
  if (shouldPollRecord(record, options)) return true;
  return Boolean(record.remainingTimeNeedsRefresh && record.isActiveTab && !record.isHidden);
}
