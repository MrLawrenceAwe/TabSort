import { isFiniteNumber } from '../../shared/guards.js';
import { getMutableTabRecord, setTabRecord } from '../windows/tracked-window-store.js';

const FALLBACK_TAB_INDEX = Number.MAX_SAFE_INTEGER;

function cloneVideoDetails(videoDetails) {
  return videoDetails && typeof videoDetails === 'object' ? { ...videoDetails } : null;
}

export function createTabRecord(tabId, windowId, defaults = {}) {
  const initialWindowId = windowId ?? defaults.windowId ?? null;
  const initialIndex = isFiniteNumber(defaults.index) ? defaults.index : FALLBACK_TAB_INDEX;
  return {
    id: tabId,
    windowId: initialWindowId,
    url: defaults.url ?? null,
    index: initialIndex,
    pinned: Boolean(defaults.pinned),
    loadState: defaults.loadState ?? null,
    contentScriptReady: Boolean(defaults.contentScriptReady),
    playbackMetricsReady: Boolean(defaults.playbackMetricsReady),
    isLive: Boolean(defaults.isLive),
    isActive: Boolean(defaults.isActive),
    isHidden: Boolean(defaults.isHidden),
    videoDetails: cloneVideoDetails(defaults.videoDetails),
    loadingStartedAt: defaults.loadingStartedAt ?? null,
    loadedAt: defaults.loadedAt ?? null,
    transitionStartedAt: defaults.transitionStartedAt ?? null,
    metricsWaitStartedAt: defaults.metricsWaitStartedAt ?? null,
    remainingSecondsStale:
      defaults.remainingSecondsStale == null ? true : Boolean(defaults.remainingSecondsStale),
    hasAutoPreparedTime: Boolean(defaults.hasAutoPreparedTime),
  };
}

export function getOrCreateTabRecord(tabId, windowId, defaults = {}) {
  if (!isFiniteNumber(tabId)) {
    return undefined;
  }

  let record = getMutableTabRecord(tabId);

  if (!record) {
    record = createTabRecord(tabId, windowId, defaults);
    setTabRecord(tabId, record);
    record = getMutableTabRecord(tabId);
  } else if (windowId != null) {
    record.windowId = windowId;
  }

  if (
    (!isFiniteNumber(record.index) || record.index === FALLBACK_TAB_INDEX) &&
    isFiniteNumber(defaults.index)
  ) {
    record.index = defaults.index;
  }

  return record;
}
