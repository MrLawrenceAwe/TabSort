import { TAB_STATES } from '../shared/constants.js';
import { isFiniteNumber } from '../shared/guards.js';
import { logDebug } from '../shared/log.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { getTab, sendMessageToTab } from './chrome-tabs.js';
import { markTabRecordStale } from './tab-record-mutations.js';
import { recomputeSortState } from './sort-state.js';
import { managedState, setManagedWindowId } from './managed-state.js';
import { getYoutubeVideoIdentity, isWatchOrShortsPage } from './youtube-url-utils.js';

const MEDIA_DURATION_SYNC_TOLERANCE_SECONDS = 2;

function areEquivalentVideoUrls(leftUrl, rightUrl) {
  const leftIdentity = getYoutubeVideoIdentity(leftUrl);
  const rightIdentity = getYoutubeVideoIdentity(rightUrl);

  if (leftIdentity && rightIdentity) {
    return leftIdentity === rightIdentity;
  }

  return Boolean(leftUrl) && Boolean(rightUrl) && leftUrl === rightUrl;
}

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

async function loadTabRecordContext(tabId) {
  const initialRecord = managedState.tabRecordsById[tabId];
  if (!initialRecord || initialRecord.status !== TAB_STATES.UNSUSPENDED) {
    return null;
  }

  const tab = await getTab(tabId);
  const record = managedState.tabRecordsById[tabId];
  if (!record || record.status !== TAB_STATES.UNSUSPENDED) {
    return null;
  }
  if (managedState.managedWindowId != null && tab.windowId !== managedState.managedWindowId) {
    return null;
  }
  if (tab.windowId != null) {
    record.windowId = tab.windowId;
    setManagedWindowId(tab.windowId);
  }
  record.isActiveTab = Boolean(tab.active);
  record.isHidden = Boolean(tab.hidden);
  if (!isWatchOrShortsPage(tab.url)) {
    return null;
  }

  return { record, tab };
}

export async function refreshTabPlaybackState(tabId) {
  try {
    const initialContext = await loadTabRecordContext(tabId);
    if (!initialContext) return;

    const requestedUrl = initialContext.tab.url || initialContext.record.url || null;
    const result = await sendMessageToTab(tabId, {
      type: RUNTIME_MESSAGE_TYPES.COLLECT_VIDEO_METRICS,
    });
    const currentContext = await loadTabRecordContext(tabId);
    if (!currentContext) return;
    const { record, tab } = currentContext;

    if (!result || result.ok !== true) {
      markTabRecordStale(record);
      recomputeSortState();
      return;
    }

    const metricsPayload = result.data;
    if (!metricsPayload || typeof metricsPayload !== 'object') return;
    const currentTabUrl = tab.url || record.url || null;
    const payloadUrl =
      typeof metricsPayload.url === 'string' && metricsPayload.url ? metricsPayload.url : null;
    if (payloadUrl && currentTabUrl && !areEquivalentVideoUrls(payloadUrl, currentTabUrl)) {
      return;
    }
    if (
      !payloadUrl &&
      requestedUrl &&
      currentTabUrl &&
      !areEquivalentVideoUrls(requestedUrl, currentTabUrl)
    ) {
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
    const playbackRate = Number(metricsPayload.playbackRate ?? 1);

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
        (videoLengthSeconds - currentTimeSeconds) /
          (isFiniteNumber(playbackRate) && playbackRate > 0 ? playbackRate : 1),
      );
      record.videoDetails.remainingTime = remainingSeconds;
      record.isRemainingTimeStale = false;
    } else {
      record.videoDetails.remainingTime = videoLengthSeconds;
      record.isRemainingTimeStale = true;
    }

    recomputeSortState();
  } catch (error) {
    logDebug(`refreshTabPlaybackState failed for ${tabId}`, error);
  }
}
