import { isValidWindowId } from '../shared/utils.js';

export const backgroundState = {
  watchTabRecordsById: {}, // { [tabId]: TabRecord }
  watchTabIdsByRemainingTime: [],
  watchTabIdsInCurrentOrder: [],
  tabsInCurrentWindowAreKnownToBeSorted: false,
  readinessMetrics: null,
  trackedWindowId: null,
  lastBroadcastSignature: null,
  recordsRefreshSeq: 0,
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
