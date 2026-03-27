import { isFiniteNumber } from '../shared/guards.js';
import { backgroundStore } from './background-store.js';

const FALLBACK_TAB_INDEX = Number.MAX_SAFE_INTEGER;

function createTrackedTabRecord(tabId, senderWindowId, defaults = {}) {
  const initialWindowId = senderWindowId ?? defaults.windowId ?? null;
  const initialIndex = isFiniteNumber(defaults.index) ? defaults.index : FALLBACK_TAB_INDEX;
  return {
    id: tabId,
    windowId: initialWindowId,
    url: defaults.url ?? null,
    index: initialIndex,
    pinned: Boolean(defaults.pinned),
    status: defaults.status ?? null,
    pageRuntimeReady: Boolean(defaults.pageRuntimeReady),
    isLiveStream: Boolean(defaults.isLiveStream),
    isActiveTab: Boolean(defaults.isActiveTab),
    isHidden: Boolean(defaults.isHidden),
    videoDetails: defaults.videoDetails ?? null,
    loadingStartedAt: defaults.loadingStartedAt ?? null,
    unsuspendedTimestamp: defaults.unsuspendedTimestamp ?? null,
    isRemainingTimeStale:
      defaults.isRemainingTimeStale == null ? true : Boolean(defaults.isRemainingTimeStale),
  };
}

export function ensureTrackedTabRecord(tabId, senderWindowId, defaults = {}) {
  if (!isFiniteNumber(tabId)) {
    return undefined;
  }

  const records = backgroundStore.trackedVideoTabsById;
  let record = records[tabId];

  if (!record) {
    record = createTrackedTabRecord(tabId, senderWindowId, defaults);
    records[tabId] = record;
  } else if (senderWindowId != null) {
    record.windowId = senderWindowId;
  }

  if (defaults && typeof defaults === 'object') {
    for (const [key, value] of Object.entries(defaults)) {
      if (value === undefined) continue;
      if (key === 'id') continue;
      if (key === 'windowId') {
        if (record.windowId == null && senderWindowId == null) {
          record.windowId = value;
        }
        continue;
      }
      if (key === 'index') {
        if (!isFiniteNumber(record.index) || record.index === FALLBACK_TAB_INDEX) {
          record.index = isFiniteNumber(value) ? value : FALLBACK_TAB_INDEX;
        }
        continue;
      }
      if (record[key] === undefined) {
        record[key] = value;
      }
    }
  }

  return record;
}
