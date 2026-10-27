import { TAB_LOAD_STATES } from '../../shared/tabs/constants.js';
import { logDebug } from '../../shared/log.js';
import { getTab } from '../tabs/chrome-tabs.js';
import { readPlaybackMetrics } from './read-metrics.js';
import { derivePlaybackUpdate } from './derive-update.js';
import { applyVideoMetricsUnavailable } from '../tabs/video-state.js';
import { applyPlaybackStateUpdate } from './apply-update.js';
import { updateSortStateAndBroadcast } from '../sorting/update-sort-state.js';
import {
  getTrackedWindowId,
  getMutableTabRecord,
  setTrackedWindowId,
} from '../windows/tracked-window-store.js';
import { hasYouTubeVideoChanged, isYouTubeVideoPage } from '../../shared/youtube/urls.js';

const DEFAULT_BATCH_CONCURRENCY = 4;
const NO_RECEIVER_RETRY_ATTEMPTS = 3;
const NO_RECEIVER_RETRY_DELAY_MS = 50;
const PLAYBACK_READ_TIMEOUT_MS = 2000;

async function loadTabRecordContext(tabId) {
  const initialRecord = getMutableTabRecord(tabId);
  if (!initialRecord || initialRecord.loadState !== TAB_LOAD_STATES.LOADED) {
    return null;
  }

  const tab = await getTab(tabId);
  if (tab?.discarded === true) return null;
  const record = getMutableTabRecord(tabId);
  if (!record || record.loadState !== TAB_LOAD_STATES.LOADED) {
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
  record.isActive = Boolean(tab.active);
  record.isHidden = Boolean(tab.hidden);
  if (!isYouTubeVideoPage(tab.url)) {
    return null;
  }

  return { record, tab };
}

export async function collectPlaybackMetrics(
  tabId,
  { recompute = true, timeoutMs = PLAYBACK_READ_TIMEOUT_MS } = {},
) {
  try {
    const initialContext = await loadTabRecordContext(tabId);
    if (!initialContext) return false;

    const requestedUrl = initialContext.tab.url || initialContext.record.url || null;
    const result = await readPlaybackMetrics(tabId, {
      timeoutMs,
      retryAttempts: NO_RECEIVER_RETRY_ATTEMPTS,
      retryDelayMs: NO_RECEIVER_RETRY_DELAY_MS,
    });
    const currentContext = await loadTabRecordContext(tabId);
    if (!currentContext) return false;
    const { record, tab } = currentContext;

    if (!result || result.ok !== true) {
      if (hasYouTubeVideoChanged(requestedUrl, tab.url)) return false;
      applyVideoMetricsUnavailable(record);
      if (recompute) updateSortStateAndBroadcast();
      return true;
    }

    const metricsPayload = result.data;
    const currentTabUrl = tab.url || record.url || null;
    const playbackUpdate = derivePlaybackUpdate({
      metricsPayload,
      record,
      requestedUrl,
      currentTabUrl,
    });
    if (!playbackUpdate) {
      return false;
    }

    applyPlaybackStateUpdate(record, playbackUpdate, currentTabUrl);
    if (recompute) updateSortStateAndBroadcast();
    return true;
  } catch (error) {
    logDebug(`collectPlaybackMetrics failed for ${tabId}`, error);
    return false;
  }
}

export async function collectPlaybackMetricsBatch(
  tabIds,
  { concurrency = DEFAULT_BATCH_CONCURRENCY, shouldRefresh = () => true } = {},
) {
  const pendingIds = Array.from(new Set(tabIds)).filter((tabId) => {
    if (typeof tabId !== 'number') return false;
    const record = getMutableTabRecord(tabId);
    return record && shouldRefresh(record);
  });
  if (!pendingIds.length) return false;

  let nextIndex = 0;
  let changed = false;
  const workerCount = Math.max(1, Math.min(concurrency, pendingIds.length));

  async function runWorker() {
    while (nextIndex < pendingIds.length) {
      const tabId = pendingIds[nextIndex];
      nextIndex += 1;
      const didChange = await collectPlaybackMetrics(tabId, { recompute: false });
      changed = changed || didChange;
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  if (changed) updateSortStateAndBroadcast();
  return changed;
}
