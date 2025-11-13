import { backgroundState } from './state.js';

export function ensureTabRecord(tabId, senderWindowId, defaults = {}) {
  if (typeof tabId !== 'number' || !Number.isFinite(tabId)) {
    return undefined;
  }

  const records = backgroundState.youtubeWatchTabRecordsOfCurrentWindow;
  let record = records[tabId];

  if (!record) {
    const initialWindowId = senderWindowId ?? defaults.windowId ?? null;
    record = {
      id: tabId,
      windowId: initialWindowId,
    };
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
      if (record[key] === undefined) {
        record[key] = value;
      }
    }
  }

  return record;
}
