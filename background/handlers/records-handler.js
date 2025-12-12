import { isValidWindowId } from '../../shared/utils.js';
import { backgroundState, resolveTrackedWindowId } from '../state.js';
import {
    buildTabSnapshot,
    refreshMetricsForTab,
    sortTabsInCurrentWindow,
    updateYoutubeWatchTabRecords,
} from '../records.js';

export function buildForceOption(windowId) {
    return isValidWindowId(windowId) ? { force: true } : undefined;
}

export async function handleUpdateYoutubeWatchTabRecords(message) {
    await updateYoutubeWatchTabRecords(message.windowId, buildForceOption(message.windowId));
}

export async function handleSendTabRecords(message) {
    await updateYoutubeWatchTabRecords(message.windowId, buildForceOption(message.windowId));
    const ids = Object.keys(backgroundState.youtubeWatchTabRecordsOfCurrentWindow).map(Number);
    await Promise.all(ids.map(refreshMetricsForTab));
    return buildTabSnapshot();
}

export async function handleAreTabsInCurrentWindowKnownToBeSorted(message) {
    await updateYoutubeWatchTabRecords(message.windowId, buildForceOption(message.windowId));
    return backgroundState.tabsInCurrentWindowAreKnownToBeSorted;
}

export async function handleSortTabs(message) {
    if (isValidWindowId(message.windowId)) {
        resolveTrackedWindowId(message.windowId, { force: true });
    }
    await sortTabsInCurrentWindow();
    await updateYoutubeWatchTabRecords(backgroundState.trackedWindowId);
}
