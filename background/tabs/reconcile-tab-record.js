import { TAB_LOAD_STATES } from '../../shared/tabs/load-states.js';
import { nowMs } from '../../shared/time.js';
import { createTabRecord } from './record.js';
import { clearRemainingTime } from './video-state.js';

export function reconcileTabRecord(
  tab,
  previousRecord = {},
  nextLoadState,
  { videoChanged = false } = {},
) {
  const isLoaded = nextLoadState === TAB_LOAD_STATES.LOADED;
  const isDiscarded = nextLoadState === TAB_LOAD_STATES.DISCARDED;
  const loadStateChanged = previousRecord.loadState && previousRecord.loadState !== nextLoadState;
  const keepsAutoPreparedTime =
    isDiscarded && !videoChanged && Boolean(previousRecord.autoPreparedRemainingTime);
  const timestamp = nowMs();

  const record = createTabRecord(tab.id, tab.windowId, {
    url: tab.url,
    index: tab.index,
    pinned: Boolean(tab.pinned),
    loadState: nextLoadState,
    contentScriptReady:
      isLoaded && !videoChanged ? Boolean(previousRecord.contentScriptReady) : false,
    playbackMetricsReady:
      isLoaded && !videoChanged ? Boolean(previousRecord.playbackMetricsReady) : false,
    isLive: videoChanged ? false : Boolean(previousRecord.isLive),
    isActive: Boolean(tab.active),
    isHidden: Boolean(tab.hidden),
    videoDetails: videoChanged ? null : previousRecord.videoDetails || null,
    loadingStartedAt: previousRecord.loadingStartedAt ?? null,
    loadedAt: previousRecord.loadedAt ?? null,
    transitionStartedAt: previousRecord.transitionStartedAt ?? null,
    metricsWaitStartedAt: videoChanged ? null : previousRecord.metricsWaitStartedAt ?? null,
    autoPreparedRemainingTime:
      !videoChanged && Boolean(previousRecord.autoPreparedRemainingTime),
    remainingSecondsStale:
      (!isLoaded && !keepsAutoPreparedTime) ||
      Boolean(previousRecord.remainingSecondsStale) ||
      (loadStateChanged && !keepsAutoPreparedTime) ||
      videoChanged,
  });

  if (nextLoadState === TAB_LOAD_STATES.LOADING) {
    if (previousRecord.loadState !== TAB_LOAD_STATES.LOADING || typeof record.loadingStartedAt !== 'number') {
      record.loadingStartedAt = timestamp;
    }
  } else {
    record.loadingStartedAt = null;
  }

  if (
    (previousRecord.loadState === TAB_LOAD_STATES.DISCARDED ||
      previousRecord.loadState === TAB_LOAD_STATES.LOADING) &&
    nextLoadState === TAB_LOAD_STATES.LOADED
  ) {
    record.loadedAt = timestamp;
    record.transitionStartedAt = timestamp;
  } else if (videoChanged) {
    record.transitionStartedAt = timestamp;
  }

  if ((!isLoaded && !keepsAutoPreparedTime || videoChanged) && record.videoDetails) {
    clearRemainingTime(record);
  }

  return record;
}
