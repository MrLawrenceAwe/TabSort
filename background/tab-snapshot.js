import { createEmptyReadinessMetrics } from '../shared/readiness.js';
import { backgroundStore } from './background-store.js';

function cloneTrackedTabRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    videoDetails: record.videoDetails ? { ...record.videoDetails } : null,
  };
}

export function buildTabSnapshot() {
  const trackedVideoTabsById = Object.fromEntries(
    Object.entries(backgroundStore.trackedVideoTabsById).map(([id, record]) => [
      id,
      cloneTrackedTabRecord(record),
    ]),
  );

  return {
    trackedVideoTabsById,
    targetSortOrderTabIds: [...backgroundStore.targetSortOrderTabIds],
    visibleTabOrderTabIds: [...backgroundStore.visibleTabOrderTabIds],
    areTrackedTabsSorted: backgroundStore.areTrackedTabsSorted,
    readinessMetrics: {
      ...(backgroundStore.readinessMetrics || createEmptyReadinessMetrics()),
    },
  };
}

export function broadcastSnapshotUpdate({ force = false } = {}) {
  try {
    const snapshot = buildTabSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === backgroundStore.lastSnapshotSignature) return;
    backgroundStore.lastSnapshotSignature = signature;

    chrome.runtime.sendMessage({ type: 'tabSnapshotUpdated', payload: snapshot }, () => {
      const err = chrome.runtime.lastError;
      if (err?.message && !/Receiving end/i.test(err.message)) {
        console.debug(`[TabSort] broadcast warning: ${err.message}`);
      }
    });
  } catch (_) {}
}
