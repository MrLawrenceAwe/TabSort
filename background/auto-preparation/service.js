import { createAutoPreparationController } from './controller.js';
import { getAutoPreparation, setAutoPreparation, getProgressWindowId, setProgressWindowId } from './state.js';
import { discardTab, getTab, listWindowTabs, updateTab } from '../tabs/chrome-tabs.js';
import {
  getMutableTabRecord,
  getTabRecord,
  getTrackedWindowId,
  listTabRecords,
} from '../windows/store.js';
import { reconcileWindowTabRecords } from '../tabs/reconcile.js';
import { collectPlaybackMetrics } from '../playback/collect.js';
import { broadcastSnapshotUpdate } from '../tab-snapshot.js';
import { updateSortStateAndBroadcast } from '../sorting/update-sort-state.js';
import { hasReadyRemainingTime } from '../../shared/tabs/sort-readiness.js';
import { getYouTubeVideoId } from '../../shared/youtube/urls.js';
import { openTikTokPipForAutoPreparation } from '../integrations/tiktok-pip.js';
import { saveAutoPreparedTab } from './auto-prepared-tabs.js';

function requireWindow(windowId) {
  if (getTrackedWindowId() !== windowId) throw new Error('Stopped because the tracked window changed');
}

const controller = createAutoPreparationController({
  async inspect(tabId, windowId) {
    requireWindow(windowId);
    let tab;
    try { tab = await getTab(tabId); } catch { return null; }
    requireWindow(windowId);
    if (tab.windowId !== windowId) return null;
    const record = getTabRecord(tabId);
    const identity = getYouTubeVideoId(tab.url);
    return {
      active: tab.active, discarded: tab.discarded, identity,
      excluded: tab.pinned || record?.isLive || !identity,
      loaded: !tab.discarded && tab.status === 'complete',
      ready: !tab.discarded && tab.status === 'complete' &&
        identity === getYouTubeVideoId(record?.url) && hasReadyRemainingTime(record),
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
  async settle(tabId, windowId, returnTabId, { autoPrepared, wasDiscarded }) {
    requireWindow(windowId);
    const autoPreparedRecord = getTabRecord(tabId);
    const autoPreparedRemainingSeconds = autoPreparedRecord?.videoDetails?.remainingSeconds;
    const autoPreparedIdentity = getYouTubeVideoId(autoPreparedRecord?.url);
    if (autoPrepared && wasDiscarded) {
      // Persist before discarding; focus changes may replace the live records.
      await saveAutoPreparedTab(autoPreparedRecord);
      const record = getMutableTabRecord(tabId);
      if (record) record.autoPreparedRemainingTime = true;
    }
    if (tabId === returnTabId) return returnTabId;
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
    if (wasDiscarded) {
      const discarded = await discardTab(tabId);
      if (discarded && autoPrepared && Number.isFinite(autoPreparedRemainingSeconds)) {
        const record = getMutableTabRecord(tabId);
        if (record && getYouTubeVideoId(record.url) === autoPreparedIdentity) {
          record.videoDetails = record.videoDetails || {};
          record.videoDetails.remainingSeconds = autoPreparedRemainingSeconds;
          record.remainingSecondsStale = false;
          record.autoPreparedRemainingTime = true;
          updateSortStateAndBroadcast();
        }
      }
    }
    return nextReturnTabId;
  },
  publish(state) {
    setAutoPreparation(state);
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
      .map(record => ({ id: record.id, identity: getYouTubeVideoId(record.url),
        title: record.videoDetails?.title || 'YouTube video' }));
    if (!items.length) return { ok: false, error: 'noUnreadyTabs' };
    const existing = getProgressWindowId();
    if (existing != null) {
      try { await chrome.windows.remove(existing); } catch { /* Already closed. */ }
    }
    const progress = await chrome.windows.create({
      url: chrome.runtime.getURL('popup/auto-preparation.html'),
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
