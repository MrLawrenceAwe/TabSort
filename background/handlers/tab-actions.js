import { TAB_STATES } from '../../shared/constants.js';
import { isValidWindowId } from '../../shared/utils.js';
import { backgroundState, now, resolveTrackedWindowId } from '../state.js';
import { broadcastTabSnapshot } from '../records.js';

export async function activateTab(message) {
    const tabId = message.tabId;
    if (!tabId) return;
    if (isValidWindowId(message.windowId)) {
        resolveTrackedWindowId(message.windowId, { force: true });
    }
    try {
        await chrome.tabs.update(tabId, { active: true });
    } catch (_) {
        // ignore activation failure
    }
}

export async function reloadTab(message) {
    const tabId = message.tabId;
    if (!tabId) return;
    if (isValidWindowId(message.windowId)) {
        resolveTrackedWindowId(message.windowId, { force: true });
    }
    try {
        await chrome.tabs.reload(tabId);
    } catch (_) {
        // ignore reload failure
    }
    const record = backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId];
    if (record) {
        record.status = TAB_STATES.LOADING;
        record.unsuspendedTimestamp = now();
        broadcastTabSnapshot();
    }
}
