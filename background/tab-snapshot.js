import { cloneSortSummary } from '../shared/sort-summary.js';
import { logDebug } from '../shared/log.js';
import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { trackedWindowSnapshot, setSnapshotSignature } from './tracked-window-store.js';

export function buildTabSnapshot() {
  return {
    tabRecordsById: trackedWindowSnapshot.tabRecordsById,
    targetVideoTabOrder: [...trackedWindowSnapshot.targetVideoTabOrder],
    trackedTabIdsInWindowOrder: [...trackedWindowSnapshot.trackedTabIdsInWindowOrder],
    allEligibleVideosSorted: trackedWindowSnapshot.allEligibleVideosSorted,
    sortSummary: cloneSortSummary(trackedWindowSnapshot.sortSummary),
  };
}

export function broadcastSnapshotUpdate({ force = false } = {}) {
  try {
    const snapshot = buildTabSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === trackedWindowSnapshot.snapshotSignature) return;
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
