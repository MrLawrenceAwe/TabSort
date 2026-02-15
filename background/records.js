import { TAB_STATES } from '../shared/constants.js';
import { loadSortOptions } from '../shared/storage.js';
import { hasFreshRemainingTime } from '../shared/tab-metrics.js';
import { isFiniteNumber, isValidWindowId } from '../shared/utils.js';
import { backgroundState, resolveTrackedWindowId } from './state.js';
import { isWatch } from './helpers.js';
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

export async function updateYoutubeWatchTabRecords(windowId, options = {}) {
  const refreshSeq = (backgroundState.recordsRefreshSeq += 1);
  const { tabs, windowId: targetWindowId } = await getTabsForTrackedWindow(windowId, options);
  if (refreshSeq !== backgroundState.recordsRefreshSeq) return;
  if (targetWindowId == null && tabs.length === 0) return;

  if (
    isValidWindowId(targetWindowId) &&
    isValidWindowId(backgroundState.trackedWindowId) &&
    targetWindowId !== backgroundState.trackedWindowId
  ) {
    return;
  }

  const previousRecords = backgroundState.youtubeWatchTabRecordsOfCurrentWindow;
  const nextRecords = {};

  for (const tab of tabs) {
    if (!isWatch(tab.url)) continue;

    const prev = previousRecords[tab.id] || {};
    const urlChanged = Boolean(prev.url) && Boolean(tab.url) && prev.url !== tab.url;
    const nextStatus = statusFromTab(tab);
    const prevContentReady = Boolean(prev.contentScriptReady);
    const statusChanged = prev.status && prev.status !== nextStatus;
    const isUnsuspended = nextStatus === TAB_STATES.UNSUSPENDED;

    const base = {
      id: tab.id,
      windowId: tab.windowId,
      url: tab.url,
      index: tab.index,
      pinned: Boolean(tab.pinned),
      status: nextStatus,
      contentScriptReady: nextStatus === TAB_STATES.UNSUSPENDED ? prevContentReady : false,
      metadataLoaded: urlChanged ? false : Boolean(prev.metadataLoaded),
      isLiveStream: urlChanged ? false : Boolean(prev.isLiveStream),
      isActiveTab: Boolean(tab.active),
      isHidden: Boolean(tab.hidden),
      videoDetails: urlChanged ? null : prev.videoDetails || null,
      unsuspendedTimestamp: prev.unsuspendedTimestamp || null,
      remainingTimeMayBeStale:
        !isUnsuspended || Boolean(prev.remainingTimeMayBeStale) || statusChanged || urlChanged,
    };

    setUnsuspendTimestamp(base, prev.status, nextStatus);

    if (
      (!isUnsuspended || urlChanged) &&
      base.videoDetails &&
      base.videoDetails.remainingTime != null
    ) {
      base.videoDetails.remainingTime = null;
    }

    nextRecords[tab.id] = base;
  }

  if (refreshSeq !== backgroundState.recordsRefreshSeq) return;
  backgroundState.youtubeWatchTabRecordsOfCurrentWindow = nextRecords;
  recomputeSorting();
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
    record.isHidden = Boolean(tab.hidden);
    if (!isWatch(tab.url)) return;

    const result = await sendMessageToTab(tabId, { message: 'getVideoMetrics' });
    if (!result || result.ok !== true) {
      record.contentScriptReady = false;
      if (record.videoDetails && record.videoDetails.remainingTime != null) {
        record.videoDetails.remainingTime = null;
      }
      record.remainingTimeMayBeStale = true;
      recomputeSorting();
      return;
    }

    const resp = result.data;
    if (!resp || typeof resp !== 'object') return;
    record.contentScriptReady = true;
    record.videoDetails = record.videoDetails || {};

    if (resp.title || resp.url) {
      if (resp.title) record.videoDetails.title = resp.title;
      if (!record.url && resp.url) record.url = resp.url;
    }

    if (resp.isLive === true) record.isLiveStream = true;
    if (resp.isLive === false) record.isLiveStream = false;

    const len = Number(resp.lengthSeconds ?? resp.duration ?? NaN);
    const cur = Number(resp.currentTime ?? NaN);
    const rate = Number(resp.playbackRate ?? 1);

    if (record.isLiveStream) {
      record.videoDetails.lengthSeconds = isFiniteNumber(len) ? len : null;
      record.videoDetails.remainingTime = null;
      record.remainingTimeMayBeStale = false;
      recomputeSorting();
      return;
    }

    if (isFiniteNumber(len)) {
      record.videoDetails.lengthSeconds = len;
    } else {
      record.videoDetails.lengthSeconds = null;
      record.videoDetails.remainingTime = null;
      record.remainingTimeMayBeStale = false;
      recomputeSorting();
      return;
    }

    if (isFiniteNumber(cur)) {
      const rem = Math.max(0, (len - cur) / (isFiniteNumber(rate) && rate > 0 ? rate : 1));
      record.videoDetails.remainingTime = rem;
      record.remainingTimeMayBeStale = false;
    } else {
      // cur is not finite but len is (we returned early if len wasn't finite)
      record.videoDetails.remainingTime = len;
      record.remainingTimeMayBeStale = true;
    }

    recomputeSorting();
  } catch (_) {
    // ignore; will retry later
  }
}

export async function sortTabsInCurrentWindow(windowId = backgroundState.trackedWindowId) {
  const orderedTabIds = backgroundState.youtubeWatchTabRecordIdsSortedByRemainingTime.slice();

  const tabsWithKnownRemainingTime = orderedTabIds.filter((tabId) => {
    const record = backgroundState.youtubeWatchTabRecordsOfCurrentWindow[tabId];
    return hasFreshRemainingTime(record);
  });

  if (tabsWithKnownRemainingTime.length < 2) return;

  const options = await loadSortOptions();
  const targetWindowId = isValidWindowId(windowId) ? windowId : null;
  const { tabs } = await getTabsForTrackedWindow(
    targetWindowId,
    targetWindowId != null ? { force: true } : undefined,
  );
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
}
