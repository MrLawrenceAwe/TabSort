import { isValidWindowId } from '../../shared/utils.js';
import { backgroundState, resolveTrackedWindowId } from '../state.js';
import {
    buildTabSnapshot,
    refreshMetricsForTab,
    sortTabsInCurrentWindow,
    updateYoutubeWatchTabRecords,
} from '../records.js';

/**
 * Builds the force option based on windowId validity.
 * @param {number|undefined} windowId
 * @returns {{ force: boolean } | undefined}
 */
export function buildForceOption(windowId) {
    return isValidWindowId(windowId) ? { force: true } : undefined;
}

/**
 * Updates YouTube watch tab records for a given window.
 * @param {Object} message - The message containing optional windowId.
 */
export async function handleUpdateYoutubeWatchTabRecords(message) {
    await updateYoutubeWatchTabRecords(message.windowId, buildForceOption(message.windowId));
}

/**
 * Sends the current tab records snapshot.
 * @param {Object} message - The message containing optional windowId.
 * @returns {Object} The tab snapshot.
 */
export async function handleSendTabRecords(message) {
    await updateYoutubeWatchTabRecords(message.windowId, buildForceOption(message.windowId));
    const ids = Object.keys(backgroundState.youtubeWatchTabRecordsOfCurrentWindow).map(Number);
    await Promise.all(ids.map(refreshMetricsForTab));
    return buildTabSnapshot();
}

/**
 * Checks if tabs in current window are known to be sorted.
 * @param {Object} message - The message containing optional windowId.
 * @returns {boolean}
 */
export async function handleAreTabsInCurrentWindowKnownToBeSorted(message) {
    await updateYoutubeWatchTabRecords(message.windowId, buildForceOption(message.windowId));
    return backgroundState.tabsInCurrentWindowAreKnownToBeSorted;
}

/**
 * Sorts tabs in the current window.
 * @param {Object} message - The message containing optional windowId.
 */
export async function handleSortTabs(message) {
    if (isValidWindowId(message.windowId)) {
        resolveTrackedWindowId(message.windowId, { force: true });
    }
    await sortTabsInCurrentWindow();
    await updateYoutubeWatchTabRecords(backgroundState.trackedWindowId);
}
