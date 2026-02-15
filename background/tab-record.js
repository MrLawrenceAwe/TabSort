import { isFiniteNumber } from '../shared/utils.js';
import { backgroundState } from './state.js';

const DEFAULT_TAB_INDEX = Number.MAX_SAFE_INTEGER;

function createTabRecord(tabId, senderWindowId, defaults = {}) {
  const initialWindowId = senderWindowId ?? defaults.windowId ?? null;
  const initialIndex = isFiniteNumber(defaults.index) ? defaults.index : DEFAULT_TAB_INDEX;
  return {
    id: tabId,
    windowId: initialWindowId,
    url: defaults.url ?? null,
    index: initialIndex,
    pinned: Boolean(defaults.pinned),
    status: defaults.status ?? null,
    contentScriptReady: Boolean(defaults.contentScriptReady),
    metadataLoaded: Boolean(defaults.metadataLoaded),
    isLiveStream: Boolean(defaults.isLiveStream),
    isActiveTab: Boolean(defaults.isActiveTab),
    isHidden: Boolean(defaults.isHidden),
    videoDetails: defaults.videoDetails ?? null,
    unsuspendedTimestamp: defaults.unsuspendedTimestamp ?? null,
    remainingTimeMayBeStale:
      defaults.remainingTimeMayBeStale == null ? true : Boolean(defaults.remainingTimeMayBeStale),
  };
}

export function ensureTabRecord(tabId, senderWindowId, defaults = {}) {
  if (!isFiniteNumber(tabId)) {
    return undefined;
  }

  const records = backgroundState.youtubeWatchTabRecordsOfCurrentWindow;
  let record = records[tabId];

  if (!record) {
    record = createTabRecord(tabId, senderWindowId, defaults);
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
        if (!isFiniteNumber(record.index) || record.index === DEFAULT_TAB_INDEX) {
          record.index = isFiniteNumber(value) ? value : DEFAULT_TAB_INDEX;
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
