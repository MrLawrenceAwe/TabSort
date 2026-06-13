import { TAB_STATES } from '../tab-states.js';
import {
  canLoadingStillSettle,
  canMediaStillSettle,
  canWatchTransitionStillSettle,
} from './settle-windows.js';

export function shouldPollRecord(record, { now = Date.now } = {}) {
  if (!record || record.isLiveNow) return false;

  const nowMs = now();
  if (record.status === TAB_STATES.UNSUSPENDED && record.remainingTimeStale) {
    const waitingForContentScript =
      !record.pageRuntimeReady && canWatchTransitionStillSettle(record, nowMs);
    const waitingForVideoElement =
      record.isActiveTab &&
      record.pageRuntimeReady &&
      !record.videoElementReady &&
      canMediaStillSettle(record, nowMs);
    return waitingForContentScript || waitingForVideoElement;
  }

  return record.status === TAB_STATES.LOADING && canLoadingStillSettle(record, nowMs);
}

export function shouldRefreshRecordMetrics(record, options = {}) {
  if (!record || record.isLiveNow || record.status !== TAB_STATES.UNSUSPENDED) return false;
  if (shouldPollRecord(record, options)) return true;
  return Boolean(record.remainingTimeStale && record.isActiveTab && !record.isHidden);
}
