import { isValidWindowId } from '../shared/utils.js';

export const backgroundState = {
  youtubeWatchTabRecordsOfCurrentWindow: {}, // { [tabId]: TabRecord }
  youtubeWatchTabRecordIdsSortedByRemainingTime: [],
  youtubeWatchTabRecordIdsInCurrentOrder: [],
  tabsInCurrentWindowAreKnownToBeSorted: false,
  readinessMetrics: null,
  trackedWindowId: null,
  lastBroadcastSignature: null,
};

export const now = () => Date.now();

export function resolveTrackedWindowId(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(backgroundState.trackedWindowId)) {
      backgroundState.trackedWindowId = windowId;
    }
  } else if (force && windowId == null) {
    backgroundState.trackedWindowId = null;
  }
  return isValidWindowId(backgroundState.trackedWindowId) ? backgroundState.trackedWindowId : null;
}
