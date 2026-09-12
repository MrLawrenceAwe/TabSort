import { getAutoPreparation } from './auto-preparation/state.js';
import { logDebug } from '../shared/log.js';
import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import {
  getSnapshotSignature,
  getSortState,
  getTabRecordsById,
  getTrackedWindowId,
  setSnapshotSignature,
} from './windows/store.js';

export function buildTabSnapshot() {
  const { trackedTabOrder, isTargetOrderApplied, sortSummary } = getSortState();
  return {
    windowId: getTrackedWindowId(),
    autoPreparation: getAutoPreparation(),
    tabRecordsById: getTabRecordsById(),
    trackedTabOrder,
    isTargetOrderApplied,
    sortSummary,
  };
}

export function broadcastSnapshotUpdate({ force = false } = {}) {
  try {
    const snapshot = buildTabSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === getSnapshotSignature()) return;
    setSnapshotSignature(signature);

    chrome.runtime.sendMessage(
      createRuntimeMessage(RUNTIME_MESSAGE_TYPES.TAB_SNAPSHOT_UPDATED, { payload: snapshot }),
      () => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError?.message && !/Receiving end/i.test(runtimeError.message)) {
          console.debug(`[TabSort] broadcast warning: ${runtimeError.message}`);
        }
      },
    );
  } catch (error) {
    logDebug('broadcastSnapshotUpdate failed', error);
  }
}
