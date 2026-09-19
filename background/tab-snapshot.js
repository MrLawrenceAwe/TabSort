import { getAutoPreparation } from './auto-preparation/state.js';
import { logDebug } from '../shared/log.js';
import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import {
  getSnapshotSignature,
  getSortState,
  getTabRecordsById,
  getTrackedWindowId,
  setSnapshotSignature,
} from './windows/tracked-window-store.js';

export function buildTabSnapshot() {
  const { trackedTabOrder, isYouTubeLayoutOrganised, sortSummary } = getSortState();
  return {
    windowId: getTrackedWindowId(),
    autoPreparation: getAutoPreparation(),
    tabRecordsById: getTabRecordsById(),
    trackedTabOrder,
    isYouTubeLayoutOrganised,
    sortSummary,
  };
}

export function broadcastSnapshotUpdate({ force = false } = {}) {
  try {
    const snapshot = buildTabSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === getSnapshotSignature()) return;
    setSnapshotSignature(signature);

    void chrome.runtime.sendMessage(
      createRuntimeMessage(RUNTIME_MESSAGE_TYPES.TAB_SNAPSHOT_UPDATED, { payload: snapshot }),
    ).catch(error => {
      if (!/Receiving end/i.test(error.message)) logDebug('broadcast warning', error);
    });
  } catch (error) {
    logDebug('broadcastSnapshotUpdate failed', error);
  }
}
