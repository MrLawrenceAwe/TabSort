import { cloneSortSummary, createEmptySortSummary } from '../shared/sort-summary.js';
import { logDebug } from '../shared/log.js';
import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { windowSessionState } from './window-session.js';
import { setSnapshotSignature } from './window-session-actions.js';

function cloneTabRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    videoDetails: record.videoDetails ? { ...record.videoDetails } : null,
  };
}

export function buildTabSnapshot() {
  const tabRecordsById = Object.fromEntries(
    Object.entries(windowSessionState.tabRecordsById).map(([id, record]) => [
      id,
      cloneTabRecord(record),
    ]),
  );

  return {
    tabRecordsById,
    targetSortableTabIds: [...windowSessionState.targetSortableTabIds],
    visibleTabIds: [...windowSessionState.visibleTabIds],
    currentOrderMatchesTarget: windowSessionState.currentOrderMatchesTarget,
    sortSummary: cloneSortSummary(windowSessionState.sortSummary || createEmptySortSummary()),
  };
}

export function broadcastSnapshotUpdate({ force = false } = {}) {
  try {
    const snapshot = buildTabSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === windowSessionState.snapshotSignature) return;
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
