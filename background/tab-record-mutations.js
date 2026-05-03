import { TAB_STATES } from '../shared/constants.js';
import { recomputeSortState } from './sort-state.js';
import { now, removeManagedTabRecord } from './managed-state.js';

export function clearTabRemainingTime(record) {
  if (record?.videoDetails && record.videoDetails.remainingTime != null) {
    record.videoDetails.remainingTime = null;
  }
}

export function markTabRecordStale(
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
    clearTabRemainingTime(record);
  }

  record.isRemainingTimeStale = true;
}

export function markTabRecordReloading(record) {
  if (!record) return;
  const timestamp = now();
  record.status = TAB_STATES.LOADING;
  record.loadingStartedAt = timestamp;
  record.unsuspendedTimestamp = timestamp;
  markTabRecordStale(record);
}

export function markTabRecordVideoChanged(record) {
  markTabRecordStale(record, {
    clearVideoDetails: true,
    resetLiveStream: true,
  });
}

export function removeTabRecord(tabId) {
  if (!removeManagedTabRecord(tabId)) return false;
  recomputeSortState();
  return true;
}
