import { hasReadyRemainingTime } from './sort-readiness.js';
import { TAB_LOAD_STATES } from './load-states.js';
import {
  canLoadingStillSettle,
  canMediaStillSettle,
  canWatchTransitionStillSettle,
} from './grace-periods.js';

export function shouldPollRecord(record, { now = Date.now } = {}) {
  if (!record) return false;
  // Live status can change without a navigation or title change.
  if (record.isLive) return record.loadState === TAB_LOAD_STATES.LOADED;

  // Awake readings change as playback advances, seeks, or changes speed,
  // even in a background tab. Sleeping preparation snapshots remain cached.
  if (record.loadState === TAB_LOAD_STATES.LOADED && hasReadyRemainingTime(record)) return true;

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
  if (!record || record.loadState !== TAB_LOAD_STATES.LOADED) return false;
  if (shouldPollRecord(record, options)) return true;
  return Boolean(record.remainingSecondsStale && record.isActive && !record.isHidden);
}
