import { TAB_STATES } from '../shared/tab-states.js';
import { logDebug } from '../shared/log.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { getTab, sendMessageToTab } from './chrome-tabs.js';
import { derivePlaybackMetricUpdate } from './playback-metric-update.js';
import {
  applyPlaybackMetricUpdate,
  markTabRecordMetricsUnavailable,
} from './tab-record-mutations.js';
import { recomputeSortState } from './sort-state.js';
import { getTabRecord, getTrackedWindowId, setTrackedWindowId } from './window-state.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';

async function loadTabRecordContext(tabId) {
  const initialRecord = getTabRecord(tabId);
  if (!initialRecord || initialRecord.status !== TAB_STATES.UNSUSPENDED) {
    return null;
  }

  const tab = await getTab(tabId);
  const record = getTabRecord(tabId);
  if (!record || record.status !== TAB_STATES.UNSUSPENDED) {
    return null;
  }
  const trackedWindowId = getTrackedWindowId();
  if (trackedWindowId != null && tab.windowId !== trackedWindowId) {
    return null;
  }
  if (tab.windowId != null) {
    record.windowId = tab.windowId;
    setTrackedWindowId(tab.windowId);
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
      markTabRecordMetricsUnavailable(record);
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

    applyPlaybackMetricUpdate(record, playbackUpdate, currentTabUrl);
    recomputeSortState();
  } catch (error) {
    logDebug(`refreshTabPlaybackMetrics failed for ${tabId}`, error);
  }
}
