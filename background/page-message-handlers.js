import { isFiniteNumber } from '../shared/guards.js';
import { ensureTabRecord } from './tab-record.js';
import { markTabRecordVideoChanged, removeTabRecord } from './tab-record-mutations.js';
import { recomputeSortState } from './sort-state.js';
import { trackedWindowState, setWindowId } from './tracked-window-state.js';
import { refreshTabPlaybackState } from './tab-playback-sync.js';
import { hasYoutubeVideoIdentityChanged, isWatchOrShortsPage } from './youtube-url-utils.js';

function isSenderInTrackedWindow(windowId) {
  if (trackedWindowState.windowId == null) return true;
  return typeof windowId === 'number' && windowId === trackedWindowState.windowId;
}

function removeTabRecordWhenSenderLeavesVideoPage(tabId) {
  if (!isFiniteNumber(tabId)) return false;
  return removeTabRecord(tabId);
}

export async function handlePageRuntimeReady(_message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (!isSenderInTrackedWindow(windowId)) return;
  if (!isFiniteNumber(tabId)) return;
  if (!isWatchOrShortsPage(sender?.tab?.url)) {
    removeTabRecordWhenSenderLeavesVideoPage(tabId);
    return;
  }
  setWindowId(windowId);

  const record = ensureTabRecord(tabId, windowId, {
    url: sender?.tab?.url ?? null,
    index: sender?.tab?.index,
    pinned: sender?.tab?.pinned,
    isActiveTab: sender?.tab?.active,
    isHidden: sender?.tab?.hidden,
  });
  record.pageRuntimeReady = true;
  record.pageMediaReady = false;
  recomputeSortState();
  return { type: 'pageRuntimeAck' };
}

export async function handlePageMediaReady(_message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (!isSenderInTrackedWindow(windowId)) return;
  if (!isFiniteNumber(tabId)) return;
  if (!isWatchOrShortsPage(sender?.tab?.url)) {
    removeTabRecordWhenSenderLeavesVideoPage(tabId);
    return;
  }
  setWindowId(windowId);
  const record = ensureTabRecord(tabId, windowId);
  record.pageMediaReady = true;
  await refreshTabPlaybackState(tabId);
}

export async function handlePageVideoDetails(message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  const details = message.details || {};
  if (!isSenderInTrackedWindow(windowId)) return;
  setWindowId(windowId);
  if (!isFiniteNumber(tabId)) return;

  const detailUrl = details.url || sender?.tab?.url;
  if (!isWatchOrShortsPage(detailUrl)) {
    removeTabRecordWhenSenderLeavesVideoPage(tabId);
    return;
  }

  const record = ensureTabRecord(tabId, windowId, { url: detailUrl });
  const urlChanged = hasYoutubeVideoIdentityChanged(record.url, detailUrl);
  if (urlChanged) {
    markTabRecordVideoChanged(record);
  }
  if (details.url) record.url = details.url;
  record.videoDetails = record.videoDetails || {};
  if (details.title) record.videoDetails.title = details.title;
  if (typeof details.isLive === 'boolean') record.isLiveNow = details.isLive;

  if (isFiniteNumber(details.lengthSeconds)) {
    record.videoDetails.lengthSeconds = details.lengthSeconds;
    if (!record.isLiveNow && record.videoDetails.remainingTime == null) {
      record.videoDetails.remainingTime = details.lengthSeconds;
      record.isRemainingTimeStale = true;
    }
  }

  if (record.isLiveNow) {
    record.videoDetails.remainingTime = null;
    record.isRemainingTimeStale = false;
  }

  recomputeSortState();
}
