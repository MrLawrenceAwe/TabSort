import { isFiniteNumber, isValidWindowId } from '../shared/guards.js';
import { logDebug } from '../shared/log.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { buildTabSnapshot } from './tab-snapshot.js';
import { ensureTabRecord } from './tab-record.js';
import {
  markTabRecordReloading,
  markTabRecordVideoChanged,
  removeTabRecord,
} from './tab-record-mutations.js';
import { recomputeSortState } from './sort-state.js';
import { listManagedTabIds, managedState, setManagedWindowId } from './managed-state.js';
import { refreshTabPlaybackState } from './tab-playback-state.js';
import { syncWindowTabRecords } from './tab-record-sync.js';
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

function isSenderInManagedWindow(windowId) {
  if (managedState.managedWindowId == null) return true;
  return typeof windowId === 'number' && windowId === managedState.managedWindowId;
}

function getManagedWindowOptions(windowId) {
  return isValidWindowId(windowId) ? { force: true } : undefined;
}

function removeTabRecordWhenSenderLeavesVideoPage(tabId) {
  if (!isFiniteNumber(tabId)) return false;
  return removeTabRecord(tabId);
}

export async function activateTab(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) return;
  if (isValidWindowId(message.windowId)) {
    setManagedWindowId(message.windowId, { force: true });
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
    setManagedWindowId(message.windowId, { force: true });
  }
  let didReload = false;
  try {
    await chrome.tabs.reload(tabId);
    didReload = true;
  } catch (error) {
    logDebug(`tabs.reload failed for ${tabId}`, error);
  }
  if (!didReload) return;
  const record = managedState.tabRecordsById[tabId];
  if (!record) return;

  markTabRecordReloading(record);
  recomputeSortState();
}

export async function syncWindowTabs(message) {
  await syncWindowTabRecords(message.windowId, getManagedWindowOptions(message.windowId));
}

export async function getWindowSnapshot(message) {
  await syncWindowTabRecords(message.windowId, getManagedWindowOptions(message.windowId));
  const ids = listManagedTabIds();
  await Promise.all(ids.map(refreshTabPlaybackState));
  return buildTabSnapshot();
}

export async function handleSortRequest(message) {
  const targetWindowId = isValidWindowId(message.windowId)
    ? message.windowId
    : managedState.managedWindowId;
  if (isValidWindowId(targetWindowId)) {
    setManagedWindowId(targetWindowId, { force: true });
  }
  await sortWindowTabs(targetWindowId);
  await syncWindowTabRecords(targetWindowId, getManagedWindowOptions(targetWindowId));
}

export async function handlePageRuntimeReadyMessage(_message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (!isSenderInManagedWindow(windowId)) return;
  if (!isFiniteNumber(tabId)) return;
  if (!isWatchOrShortsPage(sender?.tab?.url)) {
    removeTabRecordWhenSenderLeavesVideoPage(tabId);
    return;
  }
  setManagedWindowId(windowId);

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

export async function handlePageMediaReadyMessage(_message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  if (!isSenderInManagedWindow(windowId)) return;
  if (!isFiniteNumber(tabId)) return;
  if (!isWatchOrShortsPage(sender?.tab?.url)) {
    removeTabRecordWhenSenderLeavesVideoPage(tabId);
    return;
  }
  setManagedWindowId(windowId);
  const record = ensureTabRecord(tabId, windowId);
  record.pageMediaReady = true;
  await refreshTabPlaybackState(tabId);
}

export async function handlePageVideoDetailsMessage(message, sender) {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  const details = message.details || {};
  if (!isSenderInManagedWindow(windowId)) return;
  setManagedWindowId(windowId);
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
      [RUNTIME_MESSAGE_TYPES.SYNC_TRACKED_TABS]: () => syncWindowTabs(message),
      [RUNTIME_MESSAGE_TYPES.GET_TAB_SNAPSHOT]: () => getWindowSnapshot(message),
      [RUNTIME_MESSAGE_TYPES.SORT_WINDOW_TABS]: () => handleSortRequest(message),
      [RUNTIME_MESSAGE_TYPES.PING]: async () => ({ ok: true }),
      [RUNTIME_MESSAGE_TYPES.ACTIVATE_TAB]: () => activateTab(message),
      [RUNTIME_MESSAGE_TYPES.RELOAD_TAB]: () => reloadTab(message),
      [RUNTIME_MESSAGE_TYPES.LOG_POPUP_MESSAGE]: async () => {
        const level = message.level === 'error' ? 'error' : 'log';
        console[level](`[Popup] ${message.text}`);
      },
      [RUNTIME_MESSAGE_TYPES.PAGE_RUNTIME_READY]: () =>
        handlePageRuntimeReadyMessage(message, sender),
      [RUNTIME_MESSAGE_TYPES.PAGE_MEDIA_READY]: () =>
        handlePageMediaReadyMessage(message, sender),
      [RUNTIME_MESSAGE_TYPES.PAGE_VIDEO_DETAILS]: () =>
        handlePageVideoDetailsMessage(message, sender),
    };

    if (handlers[type]) {
      return respondAsync(handlers[type], type);
    }
    return false;
  });
}
