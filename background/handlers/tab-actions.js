import { TAB_STATES } from '../../shared/constants.js';
import { isFiniteNumber, isValidWindowId } from '../../shared/utils.js';
import { backgroundState, now, resolveTrackedWindowId } from '../state.js';
import { recomputeSorting } from '../ordering.js';

export async function activateTab(message) {
    const tabId = message.tabId;
    if (!isFiniteNumber(tabId)) return;
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
    if (!isFiniteNumber(tabId)) return;
    if (isValidWindowId(message.windowId)) {
        resolveTrackedWindowId(message.windowId, { force: true });
    }
    let reloadSucceeded = false;
    try {
        await chrome.tabs.reload(tabId);
        reloadSucceeded = true;
    } catch (_) {
        // ignore reload failure
    }
    if (!reloadSucceeded) return;
    const record = backgroundState.watchTabRecordsById[tabId];
    if (record) {
        record.status = TAB_STATES.LOADING;
        record.unsuspendedTimestamp = now();
        record.contentScriptReady = false;
        record.metadataLoaded = false;
        record.remainingTimeMayBeStale = true;
        if (record.videoDetails && record.videoDetails.remainingTime != null) {
            record.videoDetails.remainingTime = null;
        }
        recomputeSorting();
    }
}
