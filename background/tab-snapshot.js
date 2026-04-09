import { createEmptySortSummary } from '../shared/sort-summary.js';
import { logDebug } from '../shared/log.js';
import { trackingState } from './tracking-state.js';

function cloneTrackedTabRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    videoDetails: record.videoDetails ? { ...record.videoDetails } : null,
  };
}

function cloneSortSummary(summary) {
  const resolvedSummary = summary || createEmptySortSummary();
  return {
    counts: { ...resolvedSummary.counts },
    readyTabs: { ...resolvedSummary.readyTabs },
    backgroundTabs: { ...resolvedSummary.backgroundTabs },
    order: { ...resolvedSummary.order },
  };
}

export function buildTabSnapshot() {
  const trackedTabsById = Object.fromEntries(
    Object.entries(trackingState.trackedTabsById).map(([id, record]) => [
      id,
      cloneTrackedTabRecord(record),
    ]),
  );

  return {
    trackedTabsById,
    targetOrder: [...trackingState.targetOrder],
    visibleOrder: [...trackingState.visibleOrder],
    allSortableTabsSorted: trackingState.allSortableTabsSorted,
    sortSummary: cloneSortSummary(trackingState.sortSummary),
  };
}

export function broadcastSnapshotUpdate({ force = false } = {}) {
  try {
    const snapshot = buildTabSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === trackingState.snapshotSignature) return;
    trackingState.snapshotSignature = signature;

    chrome.runtime.sendMessage({ type: 'tabSnapshotUpdated', payload: snapshot }, () => {
      const err = chrome.runtime.lastError;
      if (err?.message && !/Receiving end/i.test(err.message)) {
        console.debug(`[TabSort] broadcast warning: ${err.message}`);
      }
    });
  } catch (error) {
    logDebug('broadcastSnapshotUpdate failed', error);
  }
}
