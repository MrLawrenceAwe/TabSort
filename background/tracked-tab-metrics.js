import { TAB_STATES } from '../shared/constants.js';
import { isFiniteNumber } from '../shared/guards.js';
import { logDebug } from '../shared/log.js';
import { getTab, sendMessageToTab } from './chrome-tabs.js';
import { recomputeSortState } from './sort-state.js';
import { backgroundStore, setTrackedWindowId } from './store.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';

const MEDIA_DURATION_SYNC_TOLERANCE_SECONDS = 2;

function resolveVideoLengthSeconds(metricsPayload, record) {
  const pageLengthSeconds = Number(metricsPayload.lengthSeconds ?? NaN);
  if (isFiniteNumber(pageLengthSeconds)) {
    return pageLengthSeconds;
  }

  const recordedLengthSeconds = Number(record?.videoDetails?.lengthSeconds ?? NaN);
  if (isFiniteNumber(recordedLengthSeconds)) {
    return recordedLengthSeconds;
  }

  const videoDurationSeconds = Number(metricsPayload.duration ?? NaN);
  return videoDurationSeconds;
}

function hasMediaDurationMismatch(metricsPayload, record, resolvedLengthSeconds) {
  const videoDurationSeconds = Number(metricsPayload.duration ?? NaN);
  if (!isFiniteNumber(videoDurationSeconds) || !isFiniteNumber(resolvedLengthSeconds)) {
    return false;
  }

  const pageLengthSeconds = Number(metricsPayload.lengthSeconds ?? NaN);
  const recordedLengthSeconds = Number(record?.videoDetails?.lengthSeconds ?? NaN);
  const authoritativeLengthSeconds = isFiniteNumber(pageLengthSeconds)
    ? pageLengthSeconds
    : recordedLengthSeconds;

  if (!isFiniteNumber(authoritativeLengthSeconds)) {
    return false;
  }

  return (
    Math.abs(videoDurationSeconds - authoritativeLengthSeconds) >
    MEDIA_DURATION_SYNC_TOLERANCE_SECONDS
  );
}

export async function refreshTrackedTabMetrics(tabId) {
  try {
    let record = backgroundStore.trackedTabsById[tabId];
    if (!record || record.status !== TAB_STATES.UNSUSPENDED) return;

    let tab = await getTab(tabId);
    record = backgroundStore.trackedTabsById[tabId];
    if (!record || record.status !== TAB_STATES.UNSUSPENDED) return;
    if (backgroundStore.trackedWindowId != null && tab.windowId !== backgroundStore.trackedWindowId) return;
    if (tab.windowId != null) {
      record.windowId = tab.windowId;
      setTrackedWindowId(tab.windowId);
    }
    record.isActiveTab = Boolean(tab.active);
    record.isHidden = Boolean(tab.hidden);
    if (!isWatchOrShortsPage(tab.url)) return;

    const requestedUrl = tab.url || record.url || null;
    const result = await sendMessageToTab(tabId, { type: 'collectVideoMetrics' });
    record = backgroundStore.trackedTabsById[tabId];
    if (!record || record.status !== TAB_STATES.UNSUSPENDED) return;

    tab = await getTab(tabId);
    record = backgroundStore.trackedTabsById[tabId];
    if (!record || record.status !== TAB_STATES.UNSUSPENDED) return;
    if (backgroundStore.trackedWindowId != null && tab.windowId !== backgroundStore.trackedWindowId) return;
    if (tab.windowId != null) {
      record.windowId = tab.windowId;
      setTrackedWindowId(tab.windowId);
    }
    record.isActiveTab = Boolean(tab.active);
    record.isHidden = Boolean(tab.hidden);
    if (!isWatchOrShortsPage(tab.url)) return;

    if (!result || result.ok !== true) {
      record.pageRuntimeReady = false;
      record.pageMediaReady = false;
      if (record.videoDetails && record.videoDetails.remainingTime != null) {
        record.videoDetails.remainingTime = null;
      }
      record.isRemainingTimeStale = true;
      recomputeSortState();
      return;
    }

    const metricsPayload = result.data;
    if (!metricsPayload || typeof metricsPayload !== 'object') return;
    const currentTabUrl = tab.url || record.url || null;
    const payloadUrl =
      typeof metricsPayload.url === 'string' && metricsPayload.url ? metricsPayload.url : null;
    if (payloadUrl && currentTabUrl && payloadUrl !== currentTabUrl) {
      return;
    }
    if (!payloadUrl && requestedUrl && currentTabUrl && requestedUrl !== currentTabUrl) {
      return;
    }

    record.pageRuntimeReady = true;
    record.pageMediaReady = metricsPayload.pageMediaReady === true;
    record.videoDetails = record.videoDetails || {};

    if (metricsPayload.title || payloadUrl || currentTabUrl) {
      if (metricsPayload.title) record.videoDetails.title = metricsPayload.title;
      record.url = payloadUrl || currentTabUrl;
    }

    if (metricsPayload.isLive === true) record.isLiveStream = true;
    if (metricsPayload.isLive === false) record.isLiveStream = false;

    const videoLengthSeconds = resolveVideoLengthSeconds(metricsPayload, record);
    const currentTimeSeconds = Number(metricsPayload.currentTime ?? NaN);
    const rate = Number(metricsPayload.playbackRate ?? 1);

    if (record.isLiveStream) {
      record.videoDetails.lengthSeconds = isFiniteNumber(videoLengthSeconds) ? videoLengthSeconds : null;
      record.videoDetails.remainingTime = null;
      record.isRemainingTimeStale = false;
      recomputeSortState();
      return;
    }

    if (isFiniteNumber(videoLengthSeconds)) {
      record.videoDetails.lengthSeconds = videoLengthSeconds;
    } else {
      record.videoDetails.lengthSeconds = null;
      record.videoDetails.remainingTime = null;
      record.isRemainingTimeStale = !record.pageMediaReady;
      recomputeSortState();
      return;
    }

    if (hasMediaDurationMismatch(metricsPayload, record, videoLengthSeconds)) {
      record.pageMediaReady = false;
      record.videoDetails.remainingTime = videoLengthSeconds;
      record.isRemainingTimeStale = true;
      recomputeSortState();
      return;
    }

    if (!record.pageMediaReady) {
      record.videoDetails.remainingTime = videoLengthSeconds;
      record.isRemainingTimeStale = true;
      recomputeSortState();
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

    recomputeSortState();
  } catch (error) {
    logDebug(`refreshTrackedTabMetrics failed for ${tabId}`, error);
  }
}
