import { isFiniteNumber } from '../shared/guards.js';
import { ensureTabRecord } from './tab-record.js';
import {
  applyContentScriptReady,
  applyVideoDetailsFromPage,
  markMediaElementObserved,
} from './tab-record-lifecycle.js';
import { recomputeSortState } from './sort-state.js';
import { collectPlaybackMetrics } from './collect-playback-metrics.js';
import {
  getTabRecord,
  getTrackedWindowId,
  deleteTabRecord,
  setTrackedWindowId,
} from './tracked-window-store.js';
import { hasYoutubeVideoIdentityChanged, isWatchOrShortsPage } from './youtube-url-utils.js';

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
  if (!isWatchOrShortsPage(pageUrl)) {
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
  const videoChanged = hasYoutubeVideoIdentityChanged(previousRecord?.url, senderUrl);
  const record = ensureTabRecord(tabId, windowId, {
    url: senderUrl,
    index: sender?.tab?.index,
    pinned: sender?.tab?.pinned,
    isActiveTab: sender?.tab?.active,
    isHidden: sender?.tab?.hidden,
  });
  applyContentScriptReady(record, { urlChanged: videoChanged, url: senderUrl });
  recomputeSortState();
  return { type: 'pageRuntimeAck' };
}

export async function handleVideoElementReady(_message, sender) {
  const pageSender = resolveVideoPageSender(sender);
  if (!pageSender) return;
  const { tabId, windowId } = pageSender;
  setTrackedWindowId(windowId);
  const record = ensureTabRecord(tabId, windowId);
  markMediaElementObserved(record);
  await collectPlaybackMetrics(tabId);
}

export async function handlePageVideoDetails(message, sender) {
  const details = message.details || {};
  const pageSender = resolveVideoPageSender(sender, { url: details.url });
  if (!pageSender) return;
  const { tabId, windowId, url: detailUrl } = pageSender;

  setTrackedWindowId(windowId);
  const record = ensureTabRecord(tabId, windowId, { url: detailUrl });
  const urlChanged = hasYoutubeVideoIdentityChanged(record.url, detailUrl);
  applyVideoDetailsFromPage(record, details, { urlChanged });
  recomputeSortState();
}
