import { isFiniteNumber } from '../../shared/utils.js';
import { backgroundState, resolveTrackedWindowId } from '../state.js';
import { broadcastTabSnapshot, recomputeSorting, refreshMetricsForTab } from '../records.js';
import { ensureTabRecord } from '../tab-record.js';

/**
 * Checks if sender window can be used for tracking.
 * @param {number|undefined} windowId
 * @returns {boolean}
 */
export function canUseSenderWindow(windowId) {
    if (backgroundState.trackedWindowId == null) return true;
    return typeof windowId === 'number' && windowId === backgroundState.trackedWindowId;
}

/**
 * Handles the content script ready message from a tab.
 * @param {Object} _message - The message (unused).
 * @param {Object} sender - The message sender.
 * @returns {{ message: string } | undefined}
 */
export async function handleContentScriptReady(_message, sender) {
    const tabId = sender?.tab?.id;
    const senderWindowId = sender?.tab?.windowId;
    if (!canUseSenderWindow(senderWindowId)) return;
    resolveTrackedWindowId(senderWindowId);
    if (!isFiniteNumber(tabId)) return;
    const record = ensureTabRecord(tabId, senderWindowId);
    record.contentScriptReady = true;
    broadcastTabSnapshot();
    await refreshMetricsForTab(tabId);
    return { message: 'contentScriptAck' };
}

/**
 * Handles the metadata loaded message from a tab.
 * @param {Object} _message - The message (unused).
 * @param {Object} sender - The message sender.
 */
export async function handleMetadataLoaded(_message, sender) {
    const tabId = sender?.tab?.id;
    const senderWindowId = sender?.tab?.windowId;
    if (!canUseSenderWindow(senderWindowId)) return;
    resolveTrackedWindowId(senderWindowId);
    if (!isFiniteNumber(tabId)) return;
    const record = backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId];
    if (record) record.metadataLoaded = true;
    broadcastTabSnapshot();
    await refreshMetricsForTab(tabId);
}

/**
 * Handles lightweight video details from a tab.
 * @param {Object} message - The message containing video details.
 * @param {Object} sender - The message sender.
 */
export async function handleLightweightDetails(message, sender) {
    const tabId = sender?.tab?.id;
    const details = message.details || {};
    const senderWindowId = sender?.tab?.windowId;
    if (!canUseSenderWindow(senderWindowId)) return;
    resolveTrackedWindowId(senderWindowId);
    if (!isFiniteNumber(tabId)) return;
    const record = ensureTabRecord(tabId, senderWindowId, {
        url: details.url || sender?.tab?.url,
    });
    if (details.url) record.url = details.url;
    record.videoDetails = record.videoDetails || {};
    if (details.title) record.videoDetails.title = details.title;
    if (typeof details.isLive === 'boolean') record.isLiveStream = details.isLive;
    if (isFiniteNumber(details.lengthSeconds)) {
        record.videoDetails.lengthSeconds = details.lengthSeconds;
        if (!record.isLiveStream && record.videoDetails.remainingTime == null) {
            record.videoDetails.remainingTime = details.lengthSeconds;
            record.remainingTimeMayBeStale = true;
        }
    }
    if (record.isLiveStream) {
        record.videoDetails.remainingTime = null;
        record.remainingTimeMayBeStale = false;
    }
    recomputeSorting();
}
