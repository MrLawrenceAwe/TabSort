import { isFiniteNumber } from '../shared/guards.js';
import { ensureTabRecord } from './tab-record.js';
import {
  applyPageRuntimeReady,
  applyPageVideoDetails,
  removeTabRecord,
} from './tab-record-mutations.js';
import { recomputeSortState } from './sort-state.js';
import { refreshTabPlaybackMetrics } from './playback-metrics-refresher.js';
import { getTabRecord, getTrackedWindowId, setTrackedWindowId } from './window-state.js';
import { hasYoutubeVideoIdentityChanged, isWatchOrShortsPage } from './youtube-url-utils.js';

function isSenderInTrackedWindow(windowId) {
  const trackedWindowId = getTrackedWindowId();
  if (trackedWindowId == null) return true;
  return typeof windowId === 'number' && windowId === trackedWindowId;
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
  setTrackedWindowId(windowId);

  const previousRecord = getTabRecord(tabId);
  const senderUrl = sender?.tab?.url ?? null;
  const videoChanged = hasYoutubeVideoIdentityChanged(previousRecord?.url, senderUrl);
  const record = ensureTabRecord(tabId, windowId, {
    url: senderUrl,
    index: sender?.tab?.index,
    pinned: sender?.tab?.pinned,
    isActiveTab: sender?.tab?.active,
    isHidden: sender?.tab?.hidden,
  });
  applyPageRuntimeReady(record, { urlChanged: videoChanged, url: senderUrl });
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
  setTrackedWindowId(windowId);
  const record = ensureTabRecord(tabId, windowId);
  record.pageMediaReady = true;
  record.mediaWaitStartedAt = null;
  await refreshTabPlaybackMetrics(tabId);
}

export async function handlePageVideoDetails(message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  const details = message.details || {};
  if (!isSenderInTrackedWindow(windowId)) return;
  setTrackedWindowId(windowId);
  if (!isFiniteNumber(tabId)) return;

  const detailUrl = details.url || sender?.tab?.url;
  if (!isWatchOrShortsPage(detailUrl)) {
    removeTabRecordWhenSenderLeavesVideoPage(tabId);
    return;
  }

  const record = ensureTabRecord(tabId, windowId, { url: detailUrl });
  const urlChanged = hasYoutubeVideoIdentityChanged(record.url, detailUrl);
  applyPageVideoDetails(record, details, { urlChanged });
  recomputeSortState();
}
