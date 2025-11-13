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
  if (typeof windowId === 'number' && Number.isFinite(windowId)) {
    if (force || !Number.isFinite(backgroundState.trackedWindowId)) {
      backgroundState.trackedWindowId = windowId;
    }
  } else if (force && windowId == null) {
    backgroundState.trackedWindowId = null;
  }
  return Number.isFinite(backgroundState.trackedWindowId) ? backgroundState.trackedWindowId : null;
}
