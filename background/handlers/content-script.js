import { isFiniteNumber } from '../../shared/utils.js';
import { backgroundState, setTrackedWindowIdIfNeeded } from '../state.js';
import { refreshTabMetrics } from '../tracked-tabs.js';
import { broadcastTabSnapshot, recomputeSorting } from '../ordering.js';
import { ensureTabRecord } from '../tab-record.js';

export function canUseSenderWindow(windowId) {
    if (backgroundState.trackedWindowId == null) return true;
    return typeof windowId === 'number' && windowId === backgroundState.trackedWindowId;
}

export async function handleContentScriptReady(_message, sender) {
    const tabId = sender?.tab?.id;
    const senderWindowId = sender?.tab?.windowId;
    if (!canUseSenderWindow(senderWindowId)) return;
    setTrackedWindowIdIfNeeded(senderWindowId);
    if (!isFiniteNumber(tabId)) return;
    const record = ensureTabRecord(tabId, senderWindowId);
    record.contentScriptReady = true;
    broadcastTabSnapshot();
    await refreshTabMetrics(tabId);
    return { message: 'contentScriptAck' };
}

export async function handleMetadataLoaded(_message, sender) {
    const tabId = sender?.tab?.id;
    const senderWindowId = sender?.tab?.windowId;
    if (!canUseSenderWindow(senderWindowId)) return;
    setTrackedWindowIdIfNeeded(senderWindowId);
    if (!isFiniteNumber(tabId)) return;
    const record = backgroundState.trackedVideoTabsById[tabId];
    if (record) record.metadataLoaded = true;
    broadcastTabSnapshot();
    await refreshTabMetrics(tabId);
}

export async function handleTabDetailsHint(message, sender) {
    const tabId = sender?.tab?.id;
    const details = message.details || {};
    const senderWindowId = sender?.tab?.windowId;
    if (!canUseSenderWindow(senderWindowId)) return;
    setTrackedWindowIdIfNeeded(senderWindowId);
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
            record.isRemainingTimeStale = true;
        }
    }
    if (record.isLiveStream) {
        record.videoDetails.remainingTime = null;
        record.isRemainingTimeStale = false;
    }
    recomputeSorting();
}
