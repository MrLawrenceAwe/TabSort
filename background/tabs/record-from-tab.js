import { TAB_LOAD_STATES } from '../../shared/tabs/load-states.js';
import { createTabRecord } from './record.js';
import { getCurrentTimeMs } from '../windows/store.js';
import { clearRemainingTime } from './video-state.js';

export function createRecordFromTab(
  tab,
  previousRecord = {},
  nextLoadState,
  { urlChanged = false } = {},
) {
  const isUnsuspended = nextLoadState === TAB_LOAD_STATES.UNSUSPENDED;
  const loadStateChanged = previousRecord.loadState && previousRecord.loadState !== nextLoadState;
  const timestamp = getCurrentTimeMs();

  const record = createTabRecord(tab.id, tab.windowId, {
    url: tab.url,
    index: tab.index,
    pinned: Boolean(tab.pinned),
    loadState: nextLoadState,
    pageRuntimeReady:
      isUnsuspended && !urlChanged ? Boolean(previousRecord.pageRuntimeReady) : false,
    videoElementReady:
      isUnsuspended && !urlChanged ? Boolean(previousRecord.videoElementReady) : false,
    isLive: urlChanged ? false : Boolean(previousRecord.isLive),
    isActive: Boolean(tab.active),
    isHidden: Boolean(tab.hidden),
    videoDetails: urlChanged ? null : previousRecord.videoDetails || null,
    loadingStartedAt: previousRecord.loadingStartedAt ?? null,
    unsuspendedTimestamp: previousRecord.unsuspendedTimestamp || null,
    transitionStartedAt: previousRecord.transitionStartedAt || null,
    waitingForVideoSince: urlChanged ? null : previousRecord.waitingForVideoSince ?? null,
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
