import { isFiniteNumber } from '../../shared/guards.js';
import { getOrCreateTabRecord } from '../tabs/record.js';
import {
  applyContentScriptReady,
  applyVideoDetailsFromPage,
  markPlaybackMetricsReady,
} from '../tabs/video-state.js';
import { recomputeSortState } from '../sorting/update-sort-state.js';
import { collectPlaybackMetrics } from '../playback/collect.js';
import {
  deleteTabRecord,
  getTabRecord,
  getTrackedWindowId,
  setTrackedWindowId,
} from '../windows/store.js';
import { hasYouTubeVideoChanged, isYouTubeVideoPage } from '../../shared/youtube/urls.js';

function isSenderInTrackedWindow(windowId) {
  const trackedWindowId = getTrackedWindowId();
  if (trackedWindowId == null) return true;
  return typeof windowId === 'number' && windowId === trackedWindowId;
}

function removeTabRecordWhenSenderLeavesVideoPage(tabId) {
  if (!isFiniteNumber(tabId)) return false;
  if (!deleteTabRecord(tabId)) return false;
  recomputeSortState();
  return true;
}

function resolveVideoPageSender(sender, { url } = {}) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  const pageUrl = url || sender?.tab?.url;

  if (!isSenderInTrackedWindow(windowId)) return null;
  if (!isFiniteNumber(tabId)) return null;
  if (!isYouTubeVideoPage(pageUrl)) {
    removeTabRecordWhenSenderLeavesVideoPage(tabId);
    return null;
  }

  return { tabId, windowId, url: pageUrl };
}

export async function handleContentScriptReady(_message, sender) {
  const pageSender = resolveVideoPageSender(sender);
  if (!pageSender) return;
  const { tabId, windowId } = pageSender;
  setTrackedWindowId(windowId);

  const previousRecord = getTabRecord(tabId);
  const senderUrl = pageSender.url ?? null;
  const videoChanged = hasYouTubeVideoChanged(previousRecord?.url, senderUrl);
  const record = getOrCreateTabRecord(tabId, windowId, {
    url: senderUrl,
    index: sender?.tab?.index,
    pinned: sender?.tab?.pinned,
    isActive: sender?.tab?.active,
    isHidden: sender?.tab?.hidden,
  });
  applyContentScriptReady(record, { urlChanged: videoChanged, url: senderUrl });
  recomputeSortState();
  return { type: 'contentScriptReadyAck' };
}

export async function handlePlaybackMetricsReady(_message, sender) {
  const pageSender = resolveVideoPageSender(sender);
  if (!pageSender) return;
  const { tabId, windowId } = pageSender;
  setTrackedWindowId(windowId);
  const record = getOrCreateTabRecord(tabId, windowId);
  markPlaybackMetricsReady(record);
  await collectPlaybackMetrics(tabId);
}

export async function handlePageVideoDetails(message, sender) {
  const details = message.details || {};
  const pageSender = resolveVideoPageSender(sender, { url: details.url });
  if (!pageSender) return;
  const { tabId, windowId, url: detailUrl } = pageSender;

  setTrackedWindowId(windowId);
  const record = getOrCreateTabRecord(tabId, windowId, { url: detailUrl });
  const urlChanged = hasYouTubeVideoChanged(record.url, detailUrl);
  applyVideoDetailsFromPage(record, details, { urlChanged });
  recomputeSortState();
}
