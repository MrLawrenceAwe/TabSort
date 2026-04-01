import { createEmptyReadinessMetrics } from '../shared/readiness.js';
import { backgroundStore } from './store.js';
import { logDebug } from '../shared/log.js';

function cloneTrackedTabRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    videoDetails: record.videoDetails ? { ...record.videoDetails } : null,
  };
}

export function buildTabSnapshot() {
  const trackedTabsById = Object.fromEntries(
    Object.entries(backgroundStore.trackedTabsById).map(([id, record]) => [
      id,
      cloneTrackedTabRecord(record),
    ]),
  );

  return {
    trackedTabsById,
    targetOrder: [...backgroundStore.targetOrder],
    visibleOrder: [...backgroundStore.visibleOrder],
    tabsSorted: backgroundStore.tabsSorted,
    readiness: {
      ...(backgroundStore.readiness || createEmptyReadinessMetrics()),
    },
  };
}

export function broadcastSnapshotUpdate({ force = false } = {}) {
  try {
    const snapshot = buildTabSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === backgroundStore.snapshotSignature) return;
    backgroundStore.snapshotSignature = signature;

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
