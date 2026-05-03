import { isFiniteNumber } from '../shared/guards.js';
import { managedState, writeManagedTabRecord } from './managed-state.js';

const FALLBACK_TAB_INDEX = Number.MAX_SAFE_INTEGER;

function createTabRecord(tabId, windowId, defaults = {}) {
  const initialWindowId = windowId ?? defaults.windowId ?? null;
  const initialIndex = isFiniteNumber(defaults.index) ? defaults.index : FALLBACK_TAB_INDEX;
  return {
    id: tabId,
    windowId: initialWindowId,
    url: defaults.url ?? null,
    index: initialIndex,
    pinned: Boolean(defaults.pinned),
    status: defaults.status ?? null,
    pageRuntimeReady: Boolean(defaults.pageRuntimeReady),
    pageMediaReady: Boolean(defaults.pageMediaReady),
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

export function ensureTabRecord(tabId, windowId, defaults = {}) {
  if (!isFiniteNumber(tabId)) {
    return undefined;
  }

  const tabRecordsById = managedState.tabRecordsById;
  let record = tabRecordsById[tabId];

  if (!record) {
    record = createTabRecord(tabId, windowId, defaults);
    writeManagedTabRecord(tabId, record);
  } else if (windowId != null) {
    record.windowId = windowId;
  }

  if (defaults && typeof defaults === 'object') {
    for (const [key, value] of Object.entries(defaults)) {
      if (value === undefined) continue;
      if (key === 'id') continue;
      if (key === 'windowId') {
        if (record.windowId == null && windowId == null) {
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
