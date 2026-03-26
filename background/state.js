import { isValidWindowId } from '../shared/utils.js';

export const backgroundState = {
  trackedVideoTabsById: {},
  trackedVideoTabIdsByRemaining: [],
  trackedVideoTabIdsByIndex: [],
  areTrackedTabsSorted: false,
  readinessMetrics: null,
  trackedWindowId: null,
  lastBroadcastSignature: null,
  refreshToken: 0,
};

export const now = () => Date.now();

export function setTrackedWindowIdIfNeeded(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(backgroundState.trackedWindowId)) {
      backgroundState.trackedWindowId = windowId;
    }
  } else if (force && windowId == null) {
    backgroundState.trackedWindowId = null;
  }
  return isValidWindowId(backgroundState.trackedWindowId) ? backgroundState.trackedWindowId : null;
}
