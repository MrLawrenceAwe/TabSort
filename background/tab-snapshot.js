import { cloneSortSummary } from '../shared/sort-summary.js';
import { logDebug } from '../shared/log.js';
import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { trackedWindowState } from './window-store.js';
import { setSnapshotSignature } from './window-store-mutations.js';

export function buildTabSnapshot() {
  return {
    tabRecordsById: trackedWindowState.tabRecordsById,
    targetSortableTabIds: [...trackedWindowState.targetSortableTabIds],
    visibleTabIds: [...trackedWindowState.visibleTabIds],
    currentOrderMatchesTarget: trackedWindowState.currentOrderMatchesTarget,
    sortSummary: cloneSortSummary(trackedWindowState.sortSummary),
  };
}

export function broadcastSnapshotUpdate({ force = false } = {}) {
  try {
    const snapshot = buildTabSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === trackedWindowState.snapshotSignature) return;
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
