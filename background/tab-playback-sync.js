import { TAB_STATES } from '../shared/tab-states.js';
import { isFiniteNumber } from '../shared/guards.js';
import { logDebug } from '../shared/log.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { getTab, sendMessageToTab } from './chrome-tabs.js';
import { derivePlaybackMetricUpdate } from './playback-metric-update.js';
import { resetTabRecordState } from './tab-record-mutations.js';
import { recomputeSortState } from './sort-state.js';
import { windowSessionState } from './window-session.js';
import { setWindowId } from './window-session-store.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';

async function loadTabRecordContext(tabId) {
  const initialRecord = windowSessionState.tabRecordsById[tabId];
  if (!initialRecord || initialRecord.status !== TAB_STATES.UNSUSPENDED) {
    return null;
  }

  const tab = await getTab(tabId);
  const record = windowSessionState.tabRecordsById[tabId];
  if (!record || record.status !== TAB_STATES.UNSUSPENDED) {
    return null;
  }
  if (windowSessionState.windowId != null && tab.windowId !== windowSessionState.windowId) {
    return null;
  }
  if (tab.windowId != null) {
    record.windowId = tab.windowId;
    setWindowId(tab.windowId);
  }
  record.isActiveTab = Boolean(tab.active);
  record.isHidden = Boolean(tab.hidden);
  if (!isWatchOrShortsPage(tab.url)) {
    return null;
  }

  return { record, tab };
}

export async function refreshTabPlaybackMetrics(tabId) {
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
      resetTabRecordState(record);
      recomputeSortState();
      return;
    }

    const metricsPayload = result.data;
    const currentTabUrl = tab.url || record.url || null;
    const playbackUpdate = derivePlaybackMetricUpdate({
      metricsPayload,
      record,
      requestedUrl,
      currentTabUrl,
    });
    if (!playbackUpdate) {
      return;
    }

    record.pageRuntimeReady = playbackUpdate.pageRuntimeReady;
    record.pageMediaReady = playbackUpdate.pageMediaReady;
    record.videoDetails = record.videoDetails || {};

    if (playbackUpdate.nextTitle || playbackUpdate.nextUrl || currentTabUrl) {
      if (playbackUpdate.nextTitle) record.videoDetails.title = playbackUpdate.nextTitle;
      record.url = playbackUpdate.nextUrl || currentTabUrl;
    }

    record.isLiveNow = Boolean(playbackUpdate.isLiveNow);
    record.videoDetails.lengthSeconds = playbackUpdate.resolvedLengthSeconds;
    record.videoDetails.remainingTime = playbackUpdate.remainingTime;
    record.isRemainingTimeStale = playbackUpdate.isRemainingTimeStale;
    recomputeSortState();
  } catch (error) {
    logDebug(`refreshTabPlaybackMetrics failed for ${tabId}`, error);
  }
}
