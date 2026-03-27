import { isValidWindowId } from '../../shared/guards.js';
import { backgroundStore, setTrackedWindowIdIfNeeded } from '../background-store.js';
import { buildTabSnapshot } from '../tab-snapshot.js';
import { refreshTabMetrics, syncTrackedTabs } from '../tab-sync.js';
import { sortWindowTabs } from '../window-sort.js';

export function buildForceSyncOptions(windowId) {
  return isValidWindowId(windowId) ? { force: true } : undefined;
}

export async function handleSyncTrackedTabs(message) {
  await syncTrackedTabs(message.windowId, buildForceSyncOptions(message.windowId));
}

export async function handleGetTabSnapshot(message) {
  await syncTrackedTabs(message.windowId, buildForceSyncOptions(message.windowId));
  const ids = Object.keys(backgroundStore.trackedVideoTabsById).map(Number);
  await Promise.all(ids.map(refreshTabMetrics));
  return buildTabSnapshot();
}

export async function handleSortWindowTabs(message) {
  const targetWindowId = isValidWindowId(message.windowId)
    ? message.windowId
    : backgroundStore.trackedWindowId;
  if (isValidWindowId(targetWindowId)) {
    setTrackedWindowIdIfNeeded(targetWindowId, { force: true });
  }
  await sortWindowTabs(targetWindowId);
  await syncTrackedTabs(targetWindowId, buildForceSyncOptions(targetWindowId));
}
