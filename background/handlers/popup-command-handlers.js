import { isValidWindowId } from '../../shared/utils.js';
import { backgroundState, resolveTrackedWindowId } from '../state.js';
import {
    refreshTabMetrics,
    sortTrackedTabsInWindow,
    syncTrackedTabs,
} from '../tracked-tabs.js';
import { buildTabSnapshot } from '../ordering.js';

export function toForceRefreshOption(windowId) {
    return isValidWindowId(windowId) ? { force: true } : undefined;
}

export async function handleSyncTrackedTabs(message) {
    await syncTrackedTabs(message.windowId, toForceRefreshOption(message.windowId));
}

export async function handleGetTabSnapshot(message) {
    await syncTrackedTabs(message.windowId, toForceRefreshOption(message.windowId));
    const ids = Object.keys(backgroundState.watchTabsById).map(Number);
    await Promise.all(ids.map(refreshTabMetrics));
    return buildTabSnapshot();
}

export async function handleSortTrackedTabs(message) {
    const targetWindowId = isValidWindowId(message.windowId)
        ? message.windowId
        : backgroundState.trackedWindowId;
    if (isValidWindowId(targetWindowId)) {
        resolveTrackedWindowId(targetWindowId, { force: true });
    }
    await sortTrackedTabsInWindow(targetWindowId);
    await syncTrackedTabs(targetWindowId, toForceRefreshOption(targetWindowId));
}
