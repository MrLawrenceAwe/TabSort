import { cloneSortSummary, createEmptySortSummary } from '../shared/sort-summary-model.js';
import { logDebug } from '../shared/log.js';
import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { setSnapshotSignature, trackedWindowState } from './tracked-window-state.js';

function cloneTabRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    videoDetails: record.videoDetails ? { ...record.videoDetails } : null,
  };
}

export function buildTabSnapshot() {
  const tabRecordsById = Object.fromEntries(
    Object.entries(trackedWindowState.tabRecordsById).map(([id, record]) => [
      id,
      cloneTabRecord(record),
    ]),
  );

  return {
    tabRecordsById,
    targetSortableTabIds: [...trackedWindowState.targetSortableTabIds],
    visibleTabIds: [...trackedWindowState.visibleTabIds],
    currentOrderMatchesTarget: trackedWindowState.currentOrderMatchesTarget,
    sortSummary: cloneSortSummary(trackedWindowState.sortSummary || createEmptySortSummary()),
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
