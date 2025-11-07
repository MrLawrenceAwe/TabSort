import { TAB_STATES } from '../shared/constants.js';
import { loadSortOptions } from '../shared/storage.js';
import { backgroundState, resolveTrackedWindowId } from './state.js';
import { isWatch, safeGet } from './helpers.js';
import { buildNonYoutubeOrder, buildYoutubeTabOrder } from './sort-strategy.js';
import {
  getTab,
  getTabsForTrackedWindow,
  moveTabsSequentially,
  sendMessageToTab,
  setUnsuspendTimestamp,
  statusFromTab,
} from './tab-service.js';

function cloneRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    videoDetails: record.videoDetails ? { ...record.videoDetails } : null,
  };
}

export function buildTabSnapshot() {
  const records = Object.fromEntries(
    Object.entries(backgroundState.youtubeWatchTabRecordsOfCurrentWindow).map(([id, record]) => [
      id,
      cloneRecord(record),
    ]),
  );

  return {
    youtubeWatchTabRecordsOfCurrentWindow: records,
    youtubeWatchTabRecordIdsSortedByRemainingTime: [
      ...backgroundState.youtubeWatchTabRecordIdsSortedByRemainingTime,
    ],
    youtubeWatchTabRecordIdsInCurrentOrder: [
      ...backgroundState.youtubeWatchTabRecordIdsInCurrentOrder,
    ],
    tabsInCurrentWindowAreKnownToBeSorted: backgroundState.tabsInCurrentWindowAreKnownToBeSorted,
  };
}

export function broadcastTabSnapshot({ force = false } = {}) {
  try {
    const snapshot = buildTabSnapshot();
    const signature = JSON.stringify(snapshot);
    if (!force && signature === backgroundState.lastBroadcastSignature) return;
    backgroundState.lastBroadcastSignature = signature;

    chrome.runtime.sendMessage({ message: 'tabRecordsUpdated', payload: snapshot }, () => {
      const err = chrome.runtime.lastError;
      if (err?.message && !/Receiving end/i.test(err.message)) {
        console.debug(`[TabSort] broadcast warning: ${err.message}`);
      }
    });
  } catch (_) {
    // no-op: can occur if service worker is shutting down or there is no listener
  }
}

export async function updateYoutubeWatchTabRecords(windowId) {
  const { tabs, windowId: targetWindowId } = await getTabsForTrackedWindow(windowId);
  if (targetWindowId == null && tabs.length === 0) return;
  const visibleIds = new Set();

  for (const tab of tabs) {
    if (!isWatch(tab.url)) continue;
    visibleIds.add(tab.id);

    const prev = backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tab.id] || {};
    const nextStatus = statusFromTab(tab);
    const prevContentReady = Boolean(prev.contentScriptReady);

    const base = (backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tab.id] = {
      id: tab.id,
      windowId: tab.windowId,
      url: tab.url,
      index: tab.index,
      status: nextStatus,
      contentScriptReady: nextStatus === TAB_STATES.UNSUSPENDED ? prevContentReady : false,
      metadataLoaded: Boolean(prev.metadataLoaded),
      isLiveStream: Boolean(prev.isLiveStream),
      isActiveTab: Boolean(tab.active),
      videoDetails: prev.videoDetails || null,
      unsuspendedTimestamp: prev.unsuspendedTimestamp || null,
      remainingTimeMayBeStale: Boolean(prev.remainingTimeMayBeStale) || false,
    });

    setUnsuspendTimestamp(base, prev.status, nextStatus);
  }

  for (const id of Object.keys(backgroundState.youtubeWatchTabRecordsOfCurrentWindow)) {
    if (!visibleIds.has(Number(id))) {
      delete backgroundState.youtubeWatchTabRecordsOfCurrentWindow[id];
    }
  }

  recalculateOrderingState();
}

function deriveCurrentOrder(records) {
  return records
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((record) => record.id);
}

function buildRemainingTimeEntries(records) {
  return records.map((record) => {
    const remainingTime = record?.videoDetails?.remainingTime;
    const isStale = Boolean(record?.remainingTimeMayBeStale);
    const value =
      !isStale && typeof remainingTime === 'number' && isFinite(remainingTime) ? remainingTime : null;
    return { id: record.id, remainingTime: value };
  });
}

function buildExpectedOrder(knownEntries, unknownEntries, currentOrder) {
  const knownDurationSortedIds = knownEntries
    .slice()
    .sort((a, b) => a.remainingTime - b.remainingTime)
    .map((entry) => entry.id);

  const unknownIdsInCurrentOrder = currentOrder.filter((id) =>
    unknownEntries.some((entry) => entry.id === id),
  );

  return [...knownDurationSortedIds, ...unknownIdsInCurrentOrder];
}

function computeDerivedOrderingState(records) {
  const currentOrder = deriveCurrentOrder(records);
  const enriched = buildRemainingTimeEntries(records);

  const knownDurationEntries = enriched.filter((entry) => entry.remainingTime !== null);
  const unknownDurationEntries = enriched.filter((entry) => entry.remainingTime === null);

  const expectedOrder = buildExpectedOrder(knownDurationEntries, unknownDurationEntries, currentOrder);
  const allRemainingTimesKnown = unknownDurationEntries.length === 0;

  const alreadyInExpectedOrder =
    currentOrder.length > 0 &&
    currentOrder.length === expectedOrder.length &&
    currentOrder.every((id, index) => id === expectedOrder[index]);

  return {
    currentOrder,
    expectedOrder,
    allRemainingTimesKnown,
    alreadyInExpectedOrder,
  };
}

function updateBackgroundOrderingState({
  currentOrder,
  expectedOrder,
  allRemainingTimesKnown,
  alreadyInExpectedOrder,
}) {
  backgroundState.youtubeWatchTabRecordIdsSortedByRemainingTime = expectedOrder;
  backgroundState.youtubeWatchTabRecordIdsInCurrentOrder = currentOrder;
  backgroundState.tabsInCurrentWindowAreKnownToBeSorted =
    allRemainingTimesKnown && alreadyInExpectedOrder;

  // Notify listeners that the ordering-related state has changed.
  broadcastTabSnapshot();
}

function recalculateOrderingState() {
  const records = Object.values(backgroundState.youtubeWatchTabRecordsOfCurrentWindow);
  const derivedState = computeDerivedOrderingState(records);
  updateBackgroundOrderingState(derivedState);
}

export function recomputeSorting() {
  recalculateOrderingState();
}

export async function refreshMetricsForTab(tabId) {
  try {
    const record = backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId];
    if (!record) return;

    if (record.status !== TAB_STATES.UNSUSPENDED) return;

    const tab = await getTab(tabId);
    if (backgroundState.trackedWindowId != null && tab.windowId !== backgroundState.trackedWindowId) return;
    if (tab.windowId != null) {
      record.windowId = tab.windowId;
      resolveTrackedWindowId(tab.windowId);
    }
    record.isActiveTab = Boolean(tab.active);
    if (!isWatch(tab.url)) return;

    const result = await sendMessageToTab(tabId, { message: 'getVideoMetrics' });
    if (!result || result.ok !== true) {
      record.contentScriptReady = false;
      if (record.videoDetails && record.videoDetails.remainingTime != null) {
        record.videoDetails.remainingTime = null;
      }
      record.remainingTimeMayBeStale = false;
      recalculateOrderingState();
      return;
    }

    const resp = result.data;
    if (!resp || typeof resp !== 'object') return;
    record.contentScriptReady = true;

    if (resp.title || resp.url) {
      record.videoDetails = record.videoDetails || {};
      if (resp.title) record.videoDetails.title = resp.title;
      if (!record.url && resp.url) record.url = resp.url;
    }

    if (resp.isLive === true) record.isLiveStream = true;

    const len = Number(resp.lengthSeconds ?? resp.duration ?? NaN);
    const cur = Number(resp.currentTime ?? NaN);
    const rate = Number(resp.playbackRate ?? 1);

    if (isFinite(len)) {
      record.videoDetails = record.videoDetails || {};
      record.videoDetails.lengthSeconds = len;
    }
    if (isFinite(len) && isFinite(cur)) {
      const rem = Math.max(0, (len - cur) / (isFinite(rate) && rate > 0 ? rate : 1));
      record.videoDetails.remainingTime = rem;
      record.remainingTimeMayBeStale = false;
    } else if (isFinite(len)) {
      if (record.videoDetails && record.videoDetails.remainingTime == null) {
        record.videoDetails.remainingTime = len;
      }
      record.remainingTimeMayBeStale = !tab.active;
    } else {
      record.remainingTimeMayBeStale = false;
    }

    recalculateOrderingState();
  } catch (_) {
    // ignore; will retry later
  }
}

export async function sortTabsInCurrentWindow() {
  const orderedTabIds = backgroundState.youtubeWatchTabRecordIdsSortedByRemainingTime.slice();

  const tabsWithKnownRemainingTime = orderedTabIds.filter((tabId) => {
    const record = backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId];
    const remainingTime = safeGet(record, 'videoDetails.remainingTime', null);
    if (record && record.remainingTimeMayBeStale) return false;
    return typeof remainingTime === 'number' && isFinite(remainingTime);
  });

  if (tabsWithKnownRemainingTime.length < 2) return;

  const options = await loadSortOptions();
  const { tabs } = await getTabsForTrackedWindow();
  if (!Array.isArray(tabs) || tabs.length === 0) return;

  const sortedTabs = tabs.slice().sort((a, b) => a.index - b.index);
  const pinnedCount = sortedTabs.filter((tab) => tab?.pinned).length;
  const unpinnedTabs = sortedTabs.filter((tab) => tab && !tab.pinned);

  const youtubeOrder = buildYoutubeTabOrder(unpinnedTabs, orderedTabIds);
  const nonYoutubeOrder = buildNonYoutubeOrder(
    unpinnedTabs,
    Boolean(options.groupNonYoutubeTabsByDomain),
  );
  const finalOrder = [...youtubeOrder, ...nonYoutubeOrder];

  if (finalOrder.length) {
    await moveTabsSequentially(finalOrder, pinnedCount);
  }

  await updateYoutubeWatchTabRecords(backgroundState.trackedWindowId);
}
