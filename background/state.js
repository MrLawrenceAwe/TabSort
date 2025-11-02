export const backgroundState = {
  youtubeWatchTabRecordsOfCurrentWindow: {}, // { [tabId]: TabRecord }
  youtubeWatchTabRecordIdsSortedByRemainingTime: [],
  youtubeWatchTabRecordIdsInCurrentOrder: [],
  tabsInCurrentWindowAreKnownToBeSorted: false,
  trackedWindowId: null,
  lastBroadcastSignature: null,
};

export const now = () => Date.now();

export function resolveTrackedWindowId(windowId) {
  if (typeof windowId === 'number' && Number.isFinite(windowId)) {
    backgroundState.trackedWindowId = windowId;
  }
  return Number.isFinite(backgroundState.trackedWindowId) ? backgroundState.trackedWindowId : null;
}
