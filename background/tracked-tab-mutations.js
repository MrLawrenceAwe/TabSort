import { TAB_STATES } from '../shared/constants.js';
import { recomputeSortState } from './sort-state.js';
import { now, trackingState } from './tracking-state.js';

export function clearTrackedTabRemainingTime(record) {
  if (record?.videoDetails && record.videoDetails.remainingTime != null) {
    record.videoDetails.remainingTime = null;
  }
}

export function markTrackedTabStale(
  record,
  {
    clearRemainingTime = true,
    clearVideoDetails = false,
    resetLiveStream = false,
    resetRuntimeReady = true,
    resetMediaReady = true,
  } = {},
) {
  if (!record) return;

  if (resetRuntimeReady) record.pageRuntimeReady = false;
  if (resetMediaReady) record.pageMediaReady = false;
  if (resetLiveStream) record.isLiveStream = false;

  if (clearVideoDetails) {
    record.videoDetails = null;
  } else if (clearRemainingTime) {
    clearTrackedTabRemainingTime(record);
  }

  record.isRemainingTimeStale = true;
}

export function markTrackedTabReloading(record) {
  if (!record) return;
  const timestamp = now();
  record.status = TAB_STATES.LOADING;
  record.loadingStartedAt = timestamp;
  record.unsuspendedTimestamp = timestamp;
  markTrackedTabStale(record);
}

export function markTrackedTabVideoChanged(record) {
  markTrackedTabStale(record, {
    clearVideoDetails: true,
    resetLiveStream: true,
  });
}

export function removeTrackedTab(tabId) {
  if (!trackingState.trackedTabsById[tabId]) return false;
  delete trackingState.trackedTabsById[tabId];
  recomputeSortState();
  return true;
}
