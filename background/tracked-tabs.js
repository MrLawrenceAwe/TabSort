import { TAB_STATES } from '../shared/constants.js';
import { loadSortOptions } from '../shared/storage.js';
import { isFiniteNumber, isValidWindowId } from '../shared/utils.js';
import { backgroundState, setTrackedWindowIdIfNeeded } from './state.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';
import { buildNonYoutubeOrder, buildYoutubeTabOrder } from './sort-strategy.js';
import {
  getTab,
  getTabsForTrackedWindow,
  moveTabsSequentially,
  sendMessageToTab,
  setUnsuspendTimestamp,
  statusFromTab,
} from './tab-service.js';
import { recomputeSorting } from './ordering.js';

export async function syncTrackedTabs(windowId, options = {}) {
  const refreshGeneration = (backgroundState.refreshToken += 1);
  const { tabs, windowId: targetWindowId } = await getTabsForTrackedWindow(windowId, options);
  if (refreshGeneration !== backgroundState.refreshToken) return;
  if (targetWindowId == null && tabs.length === 0) return;

  if (
    isValidWindowId(targetWindowId) &&
    isValidWindowId(backgroundState.trackedWindowId) &&
    targetWindowId !== backgroundState.trackedWindowId
  ) {
    return;
  }

  const previousRecords = backgroundState.trackedVideoTabsById;
  const nextRecords = {};

  for (const tab of tabs) {
    if (!isWatchOrShortsPage(tab.url)) continue;

    const previousRecord = previousRecords[tab.id] || {};
    const urlChanged = Boolean(previousRecord.url) && Boolean(tab.url) && previousRecord.url !== tab.url;
    const nextStatus = statusFromTab(tab);
    const previousContentReady = Boolean(previousRecord.contentScriptReady);
    const statusChanged = previousRecord.status && previousRecord.status !== nextStatus;
    const isUnsuspended = nextStatus === TAB_STATES.UNSUSPENDED;

    const nextRecord = {
      id: tab.id,
      windowId: tab.windowId,
      url: tab.url,
      index: tab.index,
      pinned: Boolean(tab.pinned),
      status: nextStatus,
      contentScriptReady: nextStatus === TAB_STATES.UNSUSPENDED ? previousContentReady : false,
      metadataLoaded: urlChanged ? false : Boolean(previousRecord.metadataLoaded),
      isLiveStream: urlChanged ? false : Boolean(previousRecord.isLiveStream),
      isActiveTab: Boolean(tab.active),
      isHidden: Boolean(tab.hidden),
      videoDetails: urlChanged ? null : previousRecord.videoDetails || null,
      unsuspendedTimestamp: previousRecord.unsuspendedTimestamp || null,
      isRemainingTimeStale:
        !isUnsuspended || Boolean(previousRecord.isRemainingTimeStale) || statusChanged || urlChanged,
    };

    setUnsuspendTimestamp(nextRecord, previousRecord.status, nextStatus);

    if (
      (!isUnsuspended || urlChanged) &&
      nextRecord.videoDetails &&
      nextRecord.videoDetails.remainingTime != null
    ) {
      nextRecord.videoDetails.remainingTime = null;
    }

    nextRecords[tab.id] = nextRecord;
  }

  if (refreshGeneration !== backgroundState.refreshToken) return;
  backgroundState.trackedVideoTabsById = nextRecords;
  recomputeSorting();
}


export async function refreshTabMetrics(tabId) {
  try {
    let record = backgroundState.trackedVideoTabsById[tabId];
    if (!record || record.status !== TAB_STATES.UNSUSPENDED) return;

    const tab = await getTab(tabId);
    record = backgroundState.trackedVideoTabsById[tabId];
    if (!record || record.status !== TAB_STATES.UNSUSPENDED) return;
    if (backgroundState.trackedWindowId != null && tab.windowId !== backgroundState.trackedWindowId) return;
    if (tab.windowId != null) {
      record.windowId = tab.windowId;
      setTrackedWindowIdIfNeeded(tab.windowId);
    }
    record.isActiveTab = Boolean(tab.active);
    record.isHidden = Boolean(tab.hidden);
    if (!isWatchOrShortsPage(tab.url)) return;

    const requestUrl = typeof tab.url === 'string' ? tab.url : record.url;
    const result = await sendMessageToTab(tabId, { message: 'getVideoMetrics' });
    record = backgroundState.trackedVideoTabsById[tabId];
    if (!record || record.status !== TAB_STATES.UNSUSPENDED) return;
    if (requestUrl && record.url && record.url !== requestUrl) return;
    if (!result || result.ok !== true) {
      record.contentScriptReady = false;
      if (record.videoDetails && record.videoDetails.remainingTime != null) {
        record.videoDetails.remainingTime = null;
      }
      record.isRemainingTimeStale = true;
      recomputeSorting();
      return;
    }

    const metricsPayload = result.data;
    if (!metricsPayload || typeof metricsPayload !== 'object') return;
    if (
      requestUrl &&
      typeof metricsPayload.url === 'string' &&
      metricsPayload.url &&
      metricsPayload.url !== requestUrl
    ) {
      return;
    }
    record.contentScriptReady = true;
    record.videoDetails = record.videoDetails || {};

    if (metricsPayload.title || metricsPayload.url) {
      if (metricsPayload.title) record.videoDetails.title = metricsPayload.title;
      if (!record.url && metricsPayload.url) record.url = metricsPayload.url;
    }

    if (metricsPayload.isLive === true) record.isLiveStream = true;
    if (metricsPayload.isLive === false) record.isLiveStream = false;

    const videoLengthSeconds = Number(metricsPayload.lengthSeconds ?? metricsPayload.duration ?? NaN);
    const currentTimeSeconds = Number(metricsPayload.currentTime ?? NaN);
    const rate = Number(metricsPayload.playbackRate ?? 1);

    if (record.isLiveStream) {
      record.videoDetails.lengthSeconds = isFiniteNumber(videoLengthSeconds) ? videoLengthSeconds : null;
      record.videoDetails.remainingTime = null;
      record.isRemainingTimeStale = false;
      recomputeSorting();
      return;
    }

    if (isFiniteNumber(videoLengthSeconds)) {
      record.videoDetails.lengthSeconds = videoLengthSeconds;
    } else {
      record.videoDetails.lengthSeconds = null;
      record.videoDetails.remainingTime = null;
      record.isRemainingTimeStale = false;
      recomputeSorting();
      return;
    }

    if (isFiniteNumber(currentTimeSeconds)) {
      const remainingSeconds = Math.max(
        0,
        (videoLengthSeconds - currentTimeSeconds) / (isFiniteNumber(rate) && rate > 0 ? rate : 1),
      );
      record.videoDetails.remainingTime = remainingSeconds;
      record.isRemainingTimeStale = false;
    } else {
      record.videoDetails.remainingTime = videoLengthSeconds;
      record.isRemainingTimeStale = true;
    }

    recomputeSorting();
  } catch (_) {}
}

async function resolveSortOptions(sortOptions) {
  const persistedOptions = await loadSortOptions();
  if (!sortOptions || typeof sortOptions !== 'object') {
    return persistedOptions;
  }
  return { ...persistedOptions, ...sortOptions };
}

export async function getWindowSortState(
  windowId = backgroundState.trackedWindowId,
  sortOptions,
) {
  const options = await resolveSortOptions(sortOptions);
  const targetWindowId = isValidWindowId(windowId) ? windowId : null;
  const { tabs } = await getTabsForTrackedWindow(
    targetWindowId,
    targetWindowId != null ? { force: true } : undefined,
  );

  if (!Array.isArray(tabs) || tabs.length === 0) {
    return {
      currentOrder: [],
      finalOrder: [],
      pinnedCount: 0,
      canSortWindow: false,
    };
  }

  const orderedTabIds = backgroundState.trackedVideoTabIdsByRemaining.slice();
  const sortedTabs = tabs.slice().sort((a, b) => a.index - b.index);
  const pinnedCount = sortedTabs.filter((tab) => tab?.pinned).length;
  const unpinnedTabs = sortedTabs.filter((tab) => tab && !tab.pinned);

  const currentOrder = unpinnedTabs.map((tab) => tab.id);
  const youtubeOrder = buildYoutubeTabOrder(unpinnedTabs, orderedTabIds);
  const nonYoutubeOrder = buildNonYoutubeOrder(
    unpinnedTabs,
    Boolean(options.groupNonYoutubeTabsByDomain),
  );
  const finalOrder = [...youtubeOrder, ...nonYoutubeOrder];
  const canSortWindow =
    finalOrder.length === currentOrder.length &&
    finalOrder.some((tabId, index) => tabId !== currentOrder[index]);

  return {
    currentOrder,
    finalOrder,
    pinnedCount,
    canSortWindow,
  };
}

export async function sortTrackedTabsInWindow(windowId = backgroundState.trackedWindowId, sortOptions) {
  const { finalOrder, pinnedCount, canSortWindow } = await getWindowSortState(windowId, sortOptions);

  if (canSortWindow && finalOrder.length) {
    await moveTabsSequentially(finalOrder, pinnedCount);
  }
}
