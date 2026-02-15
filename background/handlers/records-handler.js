import { isValidWindowId } from '../../shared/utils.js';
import { backgroundState, resolveTrackedWindowId } from '../state.js';
import {
    refreshMetricsForTab,
    sortTabsInCurrentWindow,
    updateYoutubeWatchTabRecords,
} from '../tab-orchestration.js';
import { buildTabSnapshot } from '../ordering.js';

export function buildForceOption(windowId) {
    return isValidWindowId(windowId) ? { force: true } : undefined;
}

export async function handleUpdateYoutubeWatchTabRecords(message) {
    await updateYoutubeWatchTabRecords(message.windowId, buildForceOption(message.windowId));
}

export async function handleSendTabRecords(message) {
    await updateYoutubeWatchTabRecords(message.windowId, buildForceOption(message.windowId));
    const ids = Object.keys(backgroundState.watchTabRecordsById).map(Number);
    await Promise.all(ids.map(refreshMetricsForTab));
    return buildTabSnapshot();
}

export async function handleAreTabsInCurrentWindowKnownToBeSorted(message) {
    await updateYoutubeWatchTabRecords(message.windowId, buildForceOption(message.windowId));
    return backgroundState.tabsInCurrentWindowAreKnownToBeSorted;
}

export async function handleSortTabs(message) {
    const targetWindowId = isValidWindowId(message.windowId)
        ? message.windowId
        : backgroundState.trackedWindowId;
    if (isValidWindowId(targetWindowId)) {
        resolveTrackedWindowId(targetWindowId, { force: true });
    }
    await sortTabsInCurrentWindow(targetWindowId);
    await updateYoutubeWatchTabRecords(targetWindowId, buildForceOption(targetWindowId));
}
