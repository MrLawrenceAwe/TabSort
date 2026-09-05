import { TAB_LOAD_STATES } from './load-states.js';
import {
  canLoadingStillSettle,
  canMediaStillSettle,
  canWatchTransitionStillSettle,
} from './grace-periods.js';

export function shouldPollRecord(record, { now = Date.now } = {}) {
  if (!record || record.isLive) return false;

  const nowMs = now();
  if (record.loadState === TAB_LOAD_STATES.LOADED && record.remainingSecondsStale) {
    const waitingForContentScript =
      !record.contentScriptReady && canWatchTransitionStillSettle(record, nowMs);
    const waitingForVideoElement =
      record.isActive &&
      record.contentScriptReady &&
      !record.playbackMetricsReady &&
      canMediaStillSettle(record, nowMs);
    return waitingForContentScript || waitingForVideoElement;
  }

  return record.loadState === TAB_LOAD_STATES.LOADING && canLoadingStillSettle(record, nowMs);
}

export function shouldRefreshRecordMetrics(record, options = {}) {
  if (!record || record.isLive || record.loadState !== TAB_LOAD_STATES.LOADED) return false;
  if (shouldPollRecord(record, options)) return true;
  return Boolean(record.remainingSecondsStale && record.isActive && !record.isHidden);
}
