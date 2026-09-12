import { applyAutoPreparedTime } from '../tabs/video-state.js';
import { createAutoPreparationController } from './controller.js';
import { getAutoPreparation, autoPreparationState, getProgressWindowId, setProgressWindowId } from './state.js';
import { discardTab, getTab, listWindowTabs, updateTab } from '../tabs/chrome-tabs.js';
import {
  getMutableTabRecord,
  getTabRecord,
  getTrackedWindowId,
  listTabRecords,
} from '../windows/store.js';
import { reconcileWindowTabRecords } from '../tabs/reconcile-window.js';
import { collectPlaybackMetrics } from '../playback/collect.js';
import { broadcastSnapshotUpdate } from '../tab-snapshot.js';
import { updateSortStateAndBroadcast } from '../sorting/update-sort-state.js';
import { hasReadyRemainingTime } from '../../shared/tabs/sort-readiness.js';
import { getYouTubeVideoId } from '../../shared/youtube/urls.js';
import { openTikTokPipForAutoPreparation } from '../integrations/tiktok-pip.js';
import { saveAutoPreparedTab } from './session-cache.js';

function requireWindow(windowId) {
  if (getTrackedWindowId() !== windowId) throw new Error('Stopped because the tracked window changed');
}

async function restoreReturnTab(tabId, windowId, returnTabId) {
  let nextReturnTabId = returnTabId;
  let restored = await updateTab(nextReturnTabId, { active: true });
  if (!restored) {
    const fallbackTabs = await listWindowTabs(windowId);
    const fallback =
      fallbackTabs?.find(tab => tab.id !== tabId && !tab.discarded) ??
      fallbackTabs?.find(tab => tab.id !== tabId);
    if (!fallback) return null;
    nextReturnTabId = fallback.id;
    restored = fallback.active || await updateTab(nextReturnTabId, { active: true });
  }
  requireWindow(windowId);
  if (!restored) return null;
  return nextReturnTabId;
}

const controller = createAutoPreparationController({
  state: autoPreparationState,
  async inspect(tabId, windowId) {
    requireWindow(windowId);
    let tab;
    try { tab = await getTab(tabId); } catch { return null; }
    requireWindow(windowId);
    if (tab.windowId !== windowId) return null;
    const record = getTabRecord(tabId);
    const videoId = getYouTubeVideoId(tab.url);
    return {
      active: tab.active, discarded: tab.discarded, videoId,
      excluded: tab.pinned || record?.isLive || !videoId,
      loaded: !tab.discarded && tab.status === 'complete',
      ready: !tab.discarded && tab.status === 'complete' &&
        videoId === getYouTubeVideoId(record?.url) && hasReadyRemainingTime(record),
      remainingSeconds: record?.videoDetails?.remainingSeconds,
    };
  },
  async activate(tabId, windowId) {
    requireWindow(windowId);
    return updateTab(tabId, { active: true });
  },
  async refresh(tabId, windowId, remainingMs) {
    requireWindow(windowId);
    let timer;
    try {
      await Promise.race([
        (async () => {
          const result = await reconcileWindowTabRecords(windowId);
          requireWindow(windowId);
          if (result.applied) await collectPlaybackMetrics(tabId);
        })(),
        new Promise(resolve => { timer = setTimeout(resolve, remainingMs); }),
      ]);
    } finally { clearTimeout(timer); }
  },
  async finishTabPreparation(tabId, windowId, returnTabId, { autoPrepared, wasDiscarded }) {
    requireWindow(windowId);
    const autoPreparedRecord = getTabRecord(tabId);
    const autoPreparedDetails = autoPreparedRecord?.videoDetails;
    const autoPreparedVideoId = getYouTubeVideoId(autoPreparedRecord?.url);
    if (autoPrepared && wasDiscarded) {
      // Persist before discarding; focus changes may replace the live records.
      if (await saveAutoPreparedTab(autoPreparedRecord)) {
        requireWindow(windowId);
        applyAutoPreparedTime(getMutableTabRecord(tabId), autoPreparedVideoId, autoPreparedDetails);
      }
    }
    if (tabId === returnTabId) return returnTabId;
    const nextReturnTabId = await restoreReturnTab(tabId, windowId, returnTabId);
    if (nextReturnTabId == null) return null;
    if (wasDiscarded) {
      const discarded = await discardTab(tabId);
      requireWindow(windowId);
      if (discarded && autoPrepared && applyAutoPreparedTime(
        getMutableTabRecord(tabId), autoPreparedVideoId, autoPreparedDetails,
      )) {
        updateSortStateAndBroadcast();
      }
    }
    return nextReturnTabId;
  },
  publish() {
    broadcastSnapshotUpdate({ force: true });
  },
});

let starting = false;
export async function startAutoPreparation(message) {
  if (starting || getAutoPreparation().status === 'running') return { ok: false, error: 'alreadyAutoPreparing' };
  starting = true;
  try {
    const tiktokPip = message.openTikTokPip === true
      ? await openTikTokPipForAutoPreparation(message.windowId)
      : null;
    const result = await reconcileWindowTabRecords(message.windowId, { force: true });
    if (!result.applied) return { ok: false, error: 'windowUnavailable' };
    const windowTabs = await listWindowTabs(result.windowId);
    const returnTabId = windowTabs?.find(tab => tab.active)?.id;
    if (returnTabId == null) return { ok: false, error: 'windowUnavailable' };
    const items = listTabRecords()
      .filter(record => !record.pinned && !record.isLive && !hasReadyRemainingTime(record))
      .sort((a, b) => a.index - b.index)
      .map(record => ({ id: record.id, videoId: getYouTubeVideoId(record.url),
        title: record.videoDetails?.title || 'YouTube video' }));
    if (!items.length) return { ok: false, error: 'noUnreadyTabs' };
    const existing = getProgressWindowId();
    if (existing != null) {
      try { await chrome.windows.remove(existing); } catch { /* Already closed. */ }
    }
    const progress = await chrome.windows.create({
      url: chrome.runtime.getURL('preparation-progress/index.html'),
      type: 'popup', focused: false, width: 440, height: 260,
    });
    setProgressWindowId(progress.id);
    requireWindow(result.windowId);
    return { ...controller.start(result.windowId, items, returnTabId), tiktokPip };
  } finally { starting = false; }
}

export function stopAutoPreparation() {
  controller.stop();
  return { ok: true, autoPreparation: getAutoPreparation() };
}

export function onAutoPreparationWindowRemoved(windowId) {
  if (windowId === getProgressWindowId()) {
    setProgressWindowId(null);
    controller.stop('Stopped because the progress window was closed');
  }
}
