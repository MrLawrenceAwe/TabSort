import { TAB_STATES } from '../shared/constants.js';
import { isFiniteNumber, isValidWindowId } from '../shared/utils.js';
import { logDebug } from '../shared/log.js';
import { buildTabSnapshot } from './tab-snapshot.js';
import { ensureTrackedTabRecord } from './tab-record.js';
import { recomputeSortState } from './sort-state.js';
import { now, setTrackedWindowId, trackingState } from './tracking-state.js';
import { refreshTabPlaybackState } from './tab-playback-state.js';
import { syncTrackedTabsForWindow } from './tracked-tab-sync.js';
import { sortWindowTabs } from './window-sort.js';
import { hasYoutubeVideoIdentityChanged, isWatchOrShortsPage } from './youtube-url-utils.js';

function createAsyncResponder(sendResponse) {
  return (fn, label) => {
    Promise.resolve()
      .then(() => fn())
      .then((result) => {
        sendResponse(result !== undefined ? result : { ok: true });
      })
      .catch((error) => {
        const messageText = error?.message || String(error);
        console.error(`[TabSort] handler "${label}" failed: ${messageText}`);
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  };
}

function isSenderInTrackedWindow(windowId) {
  if (trackingState.trackedWindowId == null) return true;
  return typeof windowId === 'number' && windowId === trackingState.trackedWindowId;
}

function getForcedTrackingOptions(windowId) {
  return isValidWindowId(windowId) ? { force: true } : undefined;
}

export async function activateTab(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) return;
  if (isValidWindowId(message.windowId)) {
    setTrackedWindowId(message.windowId, { force: true });
  }
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch (error) {
    logDebug(`tabs.update failed for ${tabId}`, error);
  }
}

export async function reloadTab(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) return;
  if (isValidWindowId(message.windowId)) {
    setTrackedWindowId(message.windowId, { force: true });
  }
  let didReload = false;
  try {
    await chrome.tabs.reload(tabId);
    didReload = true;
  } catch (error) {
    logDebug(`tabs.reload failed for ${tabId}`, error);
  }
  if (!didReload) return;
  const record = trackingState.trackedTabsById[tabId];
  if (!record) return;

  record.status = TAB_STATES.LOADING;
  record.loadingStartedAt = now();
  record.unsuspendedTimestamp = now();
  record.pageRuntimeReady = false;
  record.pageMediaReady = false;
  record.isRemainingTimeStale = true;
  if (record.videoDetails && record.videoDetails.remainingTime != null) {
    record.videoDetails.remainingTime = null;
  }
  recomputeSortState();
}

export async function syncTrackedTabs(message) {
  await syncTrackedTabsForWindow(message.windowId, getForcedTrackingOptions(message.windowId));
}

export async function getTabSnapshot(message) {
  await syncTrackedTabsForWindow(message.windowId, getForcedTrackingOptions(message.windowId));
  const ids = Object.keys(trackingState.trackedTabsById).map(Number);
  await Promise.all(ids.map(refreshTabPlaybackState));
  return buildTabSnapshot();
}

export async function handleSortRequest(message) {
  const targetWindowId = isValidWindowId(message.windowId)
    ? message.windowId
    : trackingState.trackedWindowId;
  if (isValidWindowId(targetWindowId)) {
    setTrackedWindowId(targetWindowId, { force: true });
  }
  await sortWindowTabs(targetWindowId);
  await syncTrackedTabsForWindow(targetWindowId, getForcedTrackingOptions(targetWindowId));
}

export async function handlePageRuntimeReadyMessage(_message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (!isSenderInTrackedWindow(windowId)) return;
  if (!isFiniteNumber(tabId)) return;
  if (!isWatchOrShortsPage(sender?.tab?.url)) {
    if (trackingState.trackedTabsById[tabId]) {
      delete trackingState.trackedTabsById[tabId];
      recomputeSortState();
    }
    return;
  }
  setTrackedWindowId(windowId);

  const record = ensureTrackedTabRecord(tabId, windowId, {
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

export async function handlePageMediaReadyMessage(_message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (!isSenderInTrackedWindow(windowId)) return;
  if (!isFiniteNumber(tabId)) return;
  if (!isWatchOrShortsPage(sender?.tab?.url)) {
    if (trackingState.trackedTabsById[tabId]) {
      delete trackingState.trackedTabsById[tabId];
      recomputeSortState();
    }
    return;
  }
  setTrackedWindowId(windowId);
  const record = ensureTrackedTabRecord(tabId, windowId);
  record.pageMediaReady = true;
  await refreshTabPlaybackState(tabId);
}

export async function handlePageVideoDetailsMessage(message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  const details = message.details || {};
  if (!isSenderInTrackedWindow(windowId)) return;
  setTrackedWindowId(windowId);
  if (!isFiniteNumber(tabId)) return;

  const detailUrl = details.url || sender?.tab?.url;
  if (!isWatchOrShortsPage(detailUrl)) {
    if (trackingState.trackedTabsById[tabId]) {
      delete trackingState.trackedTabsById[tabId];
      recomputeSortState();
    }
    return;
  }

  const record = ensureTrackedTabRecord(tabId, windowId, { url: detailUrl });
  const urlChanged = hasYoutubeVideoIdentityChanged(record.url, detailUrl);
  if (urlChanged) {
    record.pageRuntimeReady = false;
    record.isLiveStream = false;
    record.pageMediaReady = false;
    record.videoDetails = null;
    record.isRemainingTimeStale = true;
  }
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

export function registerMessageRouter() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message?.type;
    const respondAsync = createAsyncResponder(sendResponse);

    const handlers = {
      syncTrackedTabs: () => syncTrackedTabs(message),
      getTabSnapshot: () => getTabSnapshot(message),
      sortWindowTabs: () => handleSortRequest(message),
      ping: async () => ({ ok: true }),
      activateTab: () => activateTab(message),
      reloadTab: () => reloadTab(message),
      logPopupMessage: async () => {
        const level = message.level === 'error' ? 'error' : 'log';
        console[level](`[Popup] ${message.text}`);
      },
      pageRuntimeReady: () => handlePageRuntimeReadyMessage(message, sender),
      pageMediaReady: () => handlePageMediaReadyMessage(message, sender),
      pageVideoDetails: () => handlePageVideoDetailsMessage(message, sender),
    };

    if (handlers[type]) {
      return respondAsync(handlers[type], type);
    }
    return false;
  });
}
