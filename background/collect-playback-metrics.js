import { TAB_STATES } from '../shared/tab-states.js';
import { logDebug } from '../shared/log.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { getTab, MESSAGE_FAILURE_REASONS, sendMessageToTab } from './chrome-api.js';
import { tryInjectYoutubeBootstrap } from './content-script-injection.js';
import { derivePlaybackStateUpdate } from './derive-playback-state-update.js';
import { applyVideoMetricsUnavailable } from './tab-video-state.js';
import { applyPlaybackStateUpdate } from './apply-playback-state-update.js';
import { recomputeSortState } from './sort-state.js';
import {
  getTrackedWindowId,
  getWritableTabRecord,
  setTrackedWindowId,
} from './tracked-window-store.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';

const DEFAULT_BATCH_CONCURRENCY = 4;
const NO_RECEIVER_RETRY_ATTEMPTS = 3;
const NO_RECEIVER_RETRY_DELAY_MS = 50;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadTabRecordContext(tabId) {
  const initialRecord = getWritableTabRecord(tabId);
  if (!initialRecord || initialRecord.status !== TAB_STATES.UNSUSPENDED) {
    return null;
  }

  const tab = await getTab(tabId);
  const record = getWritableTabRecord(tabId);
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

export async function collectPlaybackMetrics(tabId, { recompute = true } = {}) {
  try {
    const initialContext = await loadTabRecordContext(tabId);
    if (!initialContext) return false;

    const requestedUrl = initialContext.tab.url || initialContext.record.url || null;
    let result = await sendMessageToTab(tabId, {
      type: RUNTIME_MESSAGE_TYPES.COLLECT_VIDEO_METRICS,
    });

    if (result?.reason === MESSAGE_FAILURE_REASONS.NO_RECEIVER) {
      const injected = await tryInjectYoutubeBootstrap(tabId);
      if (injected) {
        for (let attempt = 0; attempt < NO_RECEIVER_RETRY_ATTEMPTS; attempt += 1) {
          await sleep(NO_RECEIVER_RETRY_DELAY_MS);
          result = await sendMessageToTab(tabId, {
            type: RUNTIME_MESSAGE_TYPES.COLLECT_VIDEO_METRICS,
          });
          if (result?.reason !== MESSAGE_FAILURE_REASONS.NO_RECEIVER) break;
        }
      }
    }
    const currentContext = await loadTabRecordContext(tabId);
    if (!currentContext) return false;
    const { record, tab } = currentContext;

    if (!result || result.ok !== true) {
      applyVideoMetricsUnavailable(record);
      if (recompute) recomputeSortState();
      return true;
    }

    const metricsPayload = result.data;
    const currentTabUrl = tab.url || record.url || null;
    const playbackUpdate = derivePlaybackStateUpdate({
      metricsPayload,
      record,
      requestedUrl,
      currentTabUrl,
    });
    if (!playbackUpdate) {
      return false;
    }

    applyPlaybackStateUpdate(record, playbackUpdate, currentTabUrl);
    if (recompute) recomputeSortState();
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
    const record = getWritableTabRecord(tabId);
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
  if (changed) recomputeSortState();
  return changed;
}
