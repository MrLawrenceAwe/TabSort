import { TAB_LOAD_STATES } from '../../shared/tabs/load-states.js';
import { nowMs } from '../../shared/time.js';
import { createTabRecord } from './record.js';
import { clearRemainingTime } from './video-state.js';

export function buildTabRecord(
  tab,
  previousRecord = {},
  nextLoadState,
  { urlChanged = false } = {},
) {
  const isUnsuspended = nextLoadState === TAB_LOAD_STATES.UNSUSPENDED;
  const loadStateChanged = previousRecord.loadState && previousRecord.loadState !== nextLoadState;
  const timestamp = nowMs();

  const record = createTabRecord(tab.id, tab.windowId, {
    url: tab.url,
    index: tab.index,
    pinned: Boolean(tab.pinned),
    loadState: nextLoadState,
    contentScriptReady:
      isUnsuspended && !urlChanged ? Boolean(previousRecord.contentScriptReady) : false,
    playbackMetricsReady:
      isUnsuspended && !urlChanged ? Boolean(previousRecord.playbackMetricsReady) : false,
    isLive: urlChanged ? false : Boolean(previousRecord.isLive),
    isActive: Boolean(tab.active),
    isHidden: Boolean(tab.hidden),
    videoDetails: urlChanged ? null : previousRecord.videoDetails || null,
    loadingStartedAt: previousRecord.loadingStartedAt ?? null,
    unsuspendedTimestamp: previousRecord.unsuspendedTimestamp || null,
    transitionStartedAt: previousRecord.transitionStartedAt || null,
    metricsWaitStartedAt: urlChanged ? null : previousRecord.metricsWaitStartedAt ?? null,
    remainingTimeStale:
      !isUnsuspended ||
      Boolean(previousRecord.remainingTimeStale) ||
      loadStateChanged ||
      urlChanged,
  });

  if (nextLoadState === TAB_LOAD_STATES.LOADING) {
    if (previousRecord.loadState !== TAB_LOAD_STATES.LOADING || typeof record.loadingStartedAt !== 'number') {
      record.loadingStartedAt = timestamp;
    }
  } else {
    record.loadingStartedAt = null;
  }

  if (
    (previousRecord.loadState === TAB_LOAD_STATES.SUSPENDED ||
      previousRecord.loadState === TAB_LOAD_STATES.LOADING) &&
    nextLoadState === TAB_LOAD_STATES.UNSUSPENDED
  ) {
    record.unsuspendedTimestamp = timestamp;
    record.transitionStartedAt = timestamp;
  } else if (urlChanged) {
    record.transitionStartedAt = timestamp;
  }

  if ((!isUnsuspended || urlChanged) && record.videoDetails) {
    clearRemainingTime(record);
  }

  return record;
}
