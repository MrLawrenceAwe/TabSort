import { createAsyncResponder } from './async-responder.js';
import { TAB_STATES } from '../shared/constants.js';
import { isFiniteNumber, isValidWindowId } from '../shared/guards.js';
import { backgroundStore, now, updateTrackedWindowId } from './store.js';
import { recomputeSortState } from './sort-state.js';
import { buildTabSnapshot, broadcastSnapshotUpdate } from './tab-snapshot.js';
import { ensureTrackedTabRecord } from './tab-record.js';
import { refreshTrackedTab, syncTrackedWindowTabs } from './tracked-tabs.js';
import { sortWindowTabs } from './window-sort.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';
import { logDebug } from '../shared/log.js';

function canTrackSenderWindow(windowId) {
  if (backgroundStore.trackedWindowId == null) return true;
  return typeof windowId === 'number' && windowId === backgroundStore.trackedWindowId;
}

function toForcedWindowOptions(windowId) {
  return isValidWindowId(windowId) ? { force: true } : undefined;
}

export async function activateTabMessage(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) return;
  if (isValidWindowId(message.windowId)) {
    updateTrackedWindowId(message.windowId, { force: true });
  }
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch (error) {
    logDebug(`tabs.update failed for ${tabId}`, error);
  }
}

export async function reloadTabMessage(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) return;
  if (isValidWindowId(message.windowId)) {
    updateTrackedWindowId(message.windowId, { force: true });
  }
  let didReload = false;
  try {
    await chrome.tabs.reload(tabId);
    didReload = true;
  } catch (error) {
    logDebug(`tabs.reload failed for ${tabId}`, error);
  }
  if (!didReload) return;
  const record = backgroundStore.trackedTabsById[tabId];
  if (!record) return;

  record.status = TAB_STATES.LOADING;
  record.loadingStartedAt = now();
  record.unsuspendedTimestamp = now();
  record.pageRuntimeReady = false;
  record.isRemainingTimeStale = true;
  if (record.videoDetails && record.videoDetails.remainingTime != null) {
    record.videoDetails.remainingTime = null;
  }
  recomputeSortState();
}

export async function handleSyncMessage(message) {
  await syncTrackedWindowTabs(message.windowId, toForcedWindowOptions(message.windowId));
}

export async function handleSnapshotRequest(message) {
  await syncTrackedWindowTabs(message.windowId, toForcedWindowOptions(message.windowId));
  const ids = Object.keys(backgroundStore.trackedTabsById).map(Number);
  await Promise.all(ids.map(refreshTrackedTab));
  return buildTabSnapshot();
}

export async function handleSortRequest(message) {
  const targetWindowId = isValidWindowId(message.windowId)
    ? message.windowId
    : backgroundStore.trackedWindowId;
  if (isValidWindowId(targetWindowId)) {
    updateTrackedWindowId(targetWindowId, { force: true });
  }
  await sortWindowTabs(targetWindowId);
  await syncTrackedWindowTabs(targetWindowId, toForcedWindowOptions(targetWindowId));
}

export async function handlePageRuntimeReadyMessage(_message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (!canTrackSenderWindow(windowId)) return;
  if (!isFiniteNumber(tabId)) return;
  if (!isWatchOrShortsPage(sender?.tab?.url)) {
    if (backgroundStore.trackedTabsById[tabId]) {
      delete backgroundStore.trackedTabsById[tabId];
      recomputeSortState();
    }
    return;
  }
  updateTrackedWindowId(windowId);

  const record = ensureTrackedTabRecord(tabId, windowId);
  record.pageRuntimeReady = true;
  broadcastSnapshotUpdate({ force: true });
  await refreshTrackedTab(tabId);
  return { type: 'pageRuntimeAck' };
}

export async function handlePageMediaReadyMessage(_message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (!canTrackSenderWindow(windowId)) return;
  updateTrackedWindowId(windowId);
  if (!isFiniteNumber(tabId)) return;
  await refreshTrackedTab(tabId);
}

export async function handlePageVideoDetailsMessage(message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  const details = message.details || {};
  if (!canTrackSenderWindow(windowId)) return;
  updateTrackedWindowId(windowId);
  if (!isFiniteNumber(tabId)) return;

  const detailUrl = details.url || sender?.tab?.url;
  if (!isWatchOrShortsPage(detailUrl)) {
    if (backgroundStore.trackedTabsById[tabId]) {
      delete backgroundStore.trackedTabsById[tabId];
      recomputeSortState();
    }
    return;
  }

  const record = ensureTrackedTabRecord(tabId, windowId, { url: detailUrl });
  const urlChanged = Boolean(record.url) && Boolean(detailUrl) && record.url !== detailUrl;
  if (urlChanged) {
    record.isLiveStream = false;
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

export function registerMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message?.type;
    const respondAsync = createAsyncResponder(sendResponse);

    const handlers = {
      syncTrackedTabs: () => handleSyncMessage(message),
      getTabSnapshot: () => handleSnapshotRequest(message),
      sortWindowTabs: () => handleSortRequest(message),
      ping: async () => ({ ok: true }),
      activateTab: () => activateTabMessage(message),
      reloadTab: () => reloadTabMessage(message),
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
