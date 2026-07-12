import { TAB_LOAD_STATES } from '../tabs/load-states.js';
import {
  canLoadingStillSettle,
  canMediaStillSettle,
  canWatchTransitionStillSettle,
} from './settle-windows.js';

export function shouldPollRecord(record, { now = Date.now } = {}) {
  if (!record || record.isLive) return false;

  const nowMs = now();
  if (record.loadState === TAB_LOAD_STATES.UNSUSPENDED && record.remainingTimeStale) {
    const waitingForContentScript =
      !record.pageRuntimeReady && canWatchTransitionStillSettle(record, nowMs);
    const waitingForVideoElement =
      record.isActive &&
      record.pageRuntimeReady &&
      !record.videoElementReady &&
      canMediaStillSettle(record, nowMs);
    return waitingForContentScript || waitingForVideoElement;
  }

  return record.loadState === TAB_LOAD_STATES.LOADING && canLoadingStillSettle(record, nowMs);
}

export function shouldRefreshRecordMetrics(record, options = {}) {
  if (!record || record.isLive || record.loadState !== TAB_LOAD_STATES.UNSUSPENDED) return false;
  if (shouldPollRecord(record, options)) return true;
  return Boolean(record.remainingTimeStale && record.isActive && !record.isHidden);
}
