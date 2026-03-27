import { isValidWindowId } from '../../shared/utils.js';
import { backgroundState, setTrackedWindowIdIfNeeded } from '../state.js';
import {
    getWindowSortState,
    refreshTabMetrics,
    sortTrackedTabsInWindow,
    syncTrackedTabs,
} from '../tracked-tabs.js';
import { buildTabSnapshot } from '../ordering.js';

export function buildForceSyncOptions(windowId) {
    return isValidWindowId(windowId) ? { force: true } : undefined;
}

export async function handleSyncTrackedTabs(message) {
    await syncTrackedTabs(message.windowId, buildForceSyncOptions(message.windowId));
}

export async function handleGetTabSnapshot(message) {
    await syncTrackedTabs(message.windowId, buildForceSyncOptions(message.windowId));
    const ids = Object.keys(backgroundState.trackedVideoTabsById).map(Number);
    await Promise.all(ids.map(refreshTabMetrics));
    const { canSortWindow } = await getWindowSortState(message.windowId, message.sortOptions);
    return buildTabSnapshot({ canSortWindow });
}

export async function handleGetCurrentSnapshot(message) {
    const { canSortWindow } = await getWindowSortState(message.windowId, message.sortOptions);
    return buildTabSnapshot({ canSortWindow });
}

export async function handleSortTrackedTabs(message) {
    const targetWindowId = isValidWindowId(message.windowId)
        ? message.windowId
        : backgroundState.trackedWindowId;
    if (isValidWindowId(targetWindowId)) {
        setTrackedWindowIdIfNeeded(targetWindowId, { force: true });
    }
    await sortTrackedTabsInWindow(targetWindowId, message.sortOptions);
    await syncTrackedTabs(targetWindowId, buildForceSyncOptions(targetWindowId));
}
