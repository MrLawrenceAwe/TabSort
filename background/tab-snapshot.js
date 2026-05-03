import { cloneSortSummary, createEmptySortSummary } from '../shared/sort-summary.js';
import { logDebug } from '../shared/log.js';
import { assignManagedSnapshotSignature, managedState } from './managed-state.js';

function cloneTabRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    videoDetails: record.videoDetails ? { ...record.videoDetails } : null,
  };
}

export function buildTabSnapshot() {
  const tabRecordsById = Object.fromEntries(
    Object.entries(managedState.tabRecordsById).map(([id, record]) => [
      id,
      cloneTabRecord(record),
    ]),
  );

  return {
    tabRecordsById,
    targetOrder: [...managedState.targetOrder],
    visibleOrder: [...managedState.visibleOrder],
    allSortableTabsSorted: managedState.allSortableTabsSorted,
    sortSummary: cloneSortSummary(managedState.sortSummary || createEmptySortSummary()),
  };
}

export function broadcastSnapshotUpdate({ force = false } = {}) {
  try {
    const snapshot = buildTabSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === managedState.snapshotSignature) return;
    assignManagedSnapshotSignature(signature);

    chrome.runtime.sendMessage({ type: 'tabSnapshotUpdated', payload: snapshot }, () => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError?.message && !/Receiving end/i.test(runtimeError.message)) {
        console.debug(`[TabSort] broadcast warning: ${runtimeError.message}`);
      }
    });
  } catch (error) {
    logDebug('broadcastSnapshotUpdate failed', error);
  }
}
