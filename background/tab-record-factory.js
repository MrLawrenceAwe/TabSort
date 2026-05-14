import { TAB_STATES } from '../shared/tab-states.js';
import { createTabRecord } from './tab-record.js';
import { getCurrentTimeMs } from './tracked-window-store.js';
import { clearRemainingTime } from './tab-video-state.js';

export function createRecordFromTabSnapshot(
  tab,
  previousRecord = {},
  nextStatus,
  { urlChanged = false } = {},
) {
  const isUnsuspended = nextStatus === TAB_STATES.UNSUSPENDED;
  const statusChanged = previousRecord.status && previousRecord.status !== nextStatus;
  const timestamp = getCurrentTimeMs();

  const record = createTabRecord(tab.id, tab.windowId, {
    url: tab.url,
    index: tab.index,
    pinned: Boolean(tab.pinned),
    status: nextStatus,
    contentScriptReported:
      isUnsuspended && !urlChanged ? Boolean(previousRecord.contentScriptReported) : false,
    mediaElementObserved:
      isUnsuspended && !urlChanged ? Boolean(previousRecord.mediaElementObserved) : false,
    isLiveNow: urlChanged ? false : Boolean(previousRecord.isLiveNow),
    isActiveTab: Boolean(tab.active),
    isHidden: Boolean(tab.hidden),
    videoDetails: urlChanged ? null : previousRecord.videoDetails || null,
    loadingStartedAt: previousRecord.loadingStartedAt ?? null,
    unsuspendedTimestamp: previousRecord.unsuspendedTimestamp || null,
    transitionStartedAt: previousRecord.transitionStartedAt || null,
    videoWaitStartedAt: urlChanged ? null : previousRecord.videoWaitStartedAt ?? null,
    remainingTimeStale:
      !isUnsuspended ||
      Boolean(previousRecord.remainingTimeStale) ||
      statusChanged ||
      urlChanged,
  });

  if (nextStatus === TAB_STATES.LOADING) {
    if (previousRecord.status !== TAB_STATES.LOADING || typeof record.loadingStartedAt !== 'number') {
      record.loadingStartedAt = timestamp;
    }
  } else {
    record.loadingStartedAt = null;
  }

  if (
    (previousRecord.status === TAB_STATES.SUSPENDED ||
      previousRecord.status === TAB_STATES.LOADING) &&
    nextStatus === TAB_STATES.UNSUSPENDED
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
