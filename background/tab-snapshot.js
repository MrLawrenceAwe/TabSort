import { createSortSummary } from '../shared/sorting/summary.js';
import { logDebug } from '../shared/log.js';
import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { setSnapshotSignature, trackedWindow } from './windows/store.js';

export function buildTabSnapshot() {
  return {
    windowId: trackedWindow.windowId,
    tabRecordsById: trackedWindow.tabRecordsById,
    targetVideoTabOrder: [...trackedWindow.targetVideoTabOrder],
    trackedTabOrder: [...trackedWindow.trackedTabOrder],
    isTargetOrderApplied: trackedWindow.isTargetOrderApplied,
    sortSummary: createSortSummary(trackedWindow.sortSummary),
  };
}

export function broadcastSnapshotUpdate({ force = false } = {}) {
  try {
    const snapshot = buildTabSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === trackedWindow.snapshotSignature) return;
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
