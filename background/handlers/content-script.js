import { isFiniteNumber } from '../../shared/guards.js';
import { backgroundStore, setTrackedWindowIdIfNeeded } from '../background-store.js';
import { recomputeSortState } from '../sort-state.js';
import { broadcastSnapshotUpdate } from '../tab-snapshot.js';
import { ensureTrackedTabRecord } from '../tab-record.js';
import { refreshTabMetrics } from '../tab-sync.js';
import { isWatchOrShortsPage } from '../youtube-url-utils.js';

export function canUseSenderWindow(windowId) {
  if (backgroundStore.trackedWindowId == null) return true;
  return typeof windowId === 'number' && windowId === backgroundStore.trackedWindowId;
}

export async function handlePageRuntimeReady(_message, sender) {
  const tabId = sender?.tab?.id;
  const senderWindowId = sender?.tab?.windowId;
  if (!canUseSenderWindow(senderWindowId)) return;
  setTrackedWindowIdIfNeeded(senderWindowId);
  if (!isFiniteNumber(tabId)) return;
  const record = ensureTrackedTabRecord(tabId, senderWindowId);
  record.pageRuntimeReady = true;
  broadcastSnapshotUpdate({ force: true });
  await refreshTabMetrics(tabId);
  return { type: 'pageRuntimeAck' };
}

export async function handlePageMediaReady(_message, sender) {
  const tabId = sender?.tab?.id;
  const senderWindowId = sender?.tab?.windowId;
  if (!canUseSenderWindow(senderWindowId)) return;
  setTrackedWindowIdIfNeeded(senderWindowId);
  if (!isFiniteNumber(tabId)) return;
  await refreshTabMetrics(tabId);
}

export async function handlePageVideoDetails(message, sender) {
  const tabId = sender?.tab?.id;
  const details = message.details || {};
  const senderWindowId = sender?.tab?.windowId;
  if (!canUseSenderWindow(senderWindowId)) return;
  setTrackedWindowIdIfNeeded(senderWindowId);
  if (!isFiniteNumber(tabId)) return;
  const detailUrl = details.url || sender?.tab?.url;
  if (!isWatchOrShortsPage(detailUrl)) {
    if (backgroundStore.trackedVideoTabsById[tabId]) {
      delete backgroundStore.trackedVideoTabsById[tabId];
      recomputeSortState();
    }
    return;
  }
  const record = ensureTrackedTabRecord(tabId, senderWindowId, {
    url: detailUrl,
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
  recomputeSortState();
}
