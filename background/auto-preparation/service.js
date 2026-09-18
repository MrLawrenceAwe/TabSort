import { applyAutoPreparedTime } from '../tabs/video-state.js';
import { createAutoPreparationController } from './controller.js';
import { createPreparationWorkspace } from './workspace.js';
import { getAutoPreparation, autoPreparationState, getProgressWindowId, setProgressWindowId } from './state.js';
import { getTab, listWindowTabs, sendMessageToTab, MESSAGE_FAILURE_REASONS, getTabLoadState } from '../tabs/chrome-tabs.js';
import { getTabRecord, getTrackedWindowId, listTabRecords, setTabRecord } from '../windows/store.js';
import { createTabRecord } from '../tabs/record.js';
import { reconcileTabRecord } from '../tabs/reconcile-tab-record.js';
import { reconcileWindowTabRecords } from '../tabs/reconcile-window.js';
import { derivePlaybackUpdate } from '../playback/derive-update.js';
import { applyPlaybackStateUpdate } from '../playback/apply-update.js';
import { tryInjectYouTubeBootstrap } from '../youtube/inject.js';
import { logDebug } from '../../shared/log.js';
import { updateSortStateAndBroadcast } from '../sorting/update-sort-state.js';
import { hasReadyRemainingTime } from '../../shared/tabs/sort-readiness.js';
import { getYouTubeVideoId } from '../../shared/youtube/urls.js';
import { RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { openTikTokPipForAutoPreparation } from '../integrations/tiktok-pip.js';
import { saveAutoPreparedTab } from './session-cache.js';
import { queueAutoPreparationToolbarIndicator } from '../toolbar-indicator.js';

const workspace = createPreparationWorkspace();
// Preparation owns its records; browsing a different window can freely replace
// the popup's tracked-window store without interrupting this run.
const records = new Map();
let starting = false;
let recovery = null;
export function recoverAutoPreparation() {
  recovery ??= workspace.recover().catch(error => {
    recovery = null;
    throw error;
  });
  return recovery;
}

const controller = createAutoPreparationController({
  state: autoPreparationState,
  async inspect(tabId, windowId) {
    let tab;
    try { tab = await getTab(tabId); } catch { return null; }
    const visiting = workspace.transfer?.tabId === tabId && tab.windowId === workspace.windowId;
    if (!visiting && tab.windowId !== windowId) return null;
    // Queued tabs may have become ready through normal browsing since start.
    // Keep our private copy while visiting or when another window is tracked.
    const latest = !visiting && getTrackedWindowId() === windowId ? getTabRecord(tabId) : null;
    if (latest && getYouTubeVideoId(latest.url) === getYouTubeVideoId(tab.url)) records.set(tabId, latest);
    const record = records.get(tabId);
    const videoId = getYouTubeVideoId(tab.url);
    return {
      active: tab.active, discarded: tab.discarded, videoId,
      excluded: tab.pinned || record?.isLive || !videoId || (!visiting && tab.active),
      loaded: !tab.discarded && tab.status === 'complete',
      ready: !tab.discarded && tab.status === 'complete' &&
        videoId === getYouTubeVideoId(record?.url) && hasReadyRemainingTime(record),
      remainingSeconds: record?.videoDetails?.remainingSeconds,
    };
  },
  activate: (tabId, windowId) => workspace.visit(tabId, windowId),
  async refresh(tabId, _windowId, remainingMs, signal) {
    let timer;
    let onAbort;
    let expired = false;
    const record = records.get(tabId);
    const windowId = workspace.windowId;
    const requestedUrl = record?.url;
    try {
      await Promise.race([
        (async () => {
          const result = await sendMessageToTab(tabId, { type: RUNTIME_MESSAGE_TYPES.COLLECT_VIDEO_METRICS });
          if (expired || signal.aborted) return;
          if (result.reason === MESSAGE_FAILURE_REASONS.NO_RECEIVER) {
            await tryInjectYouTubeBootstrap(tabId);
            return; // Poll again after the content runtime has bootstrapped.
          }
          const tab = await getTab(tabId);
          if (expired || signal.aborted) return;
          if (!result.ok || tab.windowId !== windowId || workspace.transfer?.tabId !== tabId) return;
          const update = derivePlaybackUpdate({ metricsPayload: result.data, record, requestedUrl, currentTabUrl: tab.url });
          if (!update) return;
          record.loadState = getTabLoadState(tab);
          applyPlaybackStateUpdate(record, update, tab.url);
        })(),
        new Promise(resolve => { timer = setTimeout(resolve, remainingMs); }),
        new Promise(resolve => {
          onAbort = resolve;
          if (signal.aborted) resolve();
          else signal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
    } finally {
      expired = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }
  },
  async finishTabPreparation(tabId, _windowId, { autoPrepared, wasDiscarded }) {
    const record = records.get(tabId);
    const returned = await workspace.returnTab();
    if (!returned) return;
    const sameVideo = getYouTubeVideoId(returned.url) === getYouTubeVideoId(record?.url);
    // Never discard a tab the user has selected or navigated in the meantime.
    if (wasDiscarded && !returned.active && sameVideo) {
      if (autoPrepared) await saveAutoPreparedTab(record);
      // Chrome can replace the tab ID when discarding. Use the returned ID
      // instead of probing a tab that no longer exists.
      const discarded = await chrome.tabs.discard(tabId).catch(() => null);
      if (typeof discarded?.id === 'number') {
        tabId = discarded.id;
        if (autoPrepared) await saveAutoPreparedTab({ ...record, id: tabId });
      }
    }
    const tab = await getTab(tabId);
    if (tab.windowId !== getTrackedWindowId()) return;
    const next = reconcileTabRecord(tab, record ?? {}, getTabLoadState(tab), { videoChanged: !sameVideo });
    if (autoPrepared && sameVideo) {
      applyAutoPreparedTime(next, getYouTubeVideoId(record.url), record.videoDetails, tab.url);
    }
    setTabRecord(tab.id, next);
    updateSortStateAndBroadcast();
  },
  async cleanup() {
    await workspace.close();
    records.clear();
  },
  publish(autoPreparation) {
    void queueAutoPreparationToolbarIndicator(autoPreparation);
    void chrome.runtime.sendMessage({
      type: RUNTIME_MESSAGE_TYPES.AUTO_PREPARATION_UPDATED, autoPreparation,
    }).catch(error => logDebug('auto-preparation broadcast failed', error));
  },
});

export async function startAutoPreparation(message) {
  if (starting || getAutoPreparation().status === 'running') return { ok: false, error: 'alreadyAutoPreparing' };
  starting = true;
  try {
    await recoverAutoPreparation();
    await workspace.close();
    const result = await reconcileWindowTabRecords(message.windowId, { force: true });
    if (!result.applied) return { ok: false, error: 'windowUnavailable' };
    const windowTabs = await listWindowTabs(result.windowId);
    if (!windowTabs?.length) return { ok: false, error: 'windowUnavailable' };
    const candidates = listTabRecords();
    const items = candidates
      .filter(record => !record.pinned && !record.isLive && !hasReadyRemainingTime(record))
      .sort((a, b) => a.index - b.index)
      .map(record => ({ id: record.id, videoId: getYouTubeVideoId(record.url),
        title: record.videoDetails?.title || 'YouTube video' }));
    if (!items.length) return { ok: false, error: 'noUnreadyTabs' };
    const tiktokPip = message.openTikTokPip === true
      ? await openTikTokPipForAutoPreparation(result.windowId)
      : null;
    const existing = getProgressWindowId();
    if (existing != null) {
      // Remove only our old progress tab, never an entire window with user tabs.
      const tabs = await listWindowTabs(existing);
      for (const tab of tabs ?? []) {
        if (tab.url === chrome.runtime.getURL('preparation-progress/index.html')) await chrome.tabs.remove(tab.id);
      }
      setProgressWindowId(null);
    }
    for (const tab of windowTabs) {
      const record = getTabRecord(tab.id) ?? createTabRecord(tab.id, tab.windowId, { url: tab.url });
      records.set(tab.id, record);
    }
    const windowId = await workspace.create(result.windowId);
    setProgressWindowId(windowId);
    return { ...controller.start(result.windowId, items), tiktokPip };
  } catch (error) {
    await workspace.close();
    throw error;
  } finally { starting = false; }
}

export async function stopAutoPreparation() {
  await controller.stop();
  return { ok: true, autoPreparation: getAutoPreparation() };
}

export function onAutoPreparationWindowRemoved(windowId) {
  if (windowId === getProgressWindowId()) {
    setProgressWindowId(null);
    void controller.stop('Preparation window closed. Use the placeholder to reopen its video.');
  }
}


export async function onAutoPreparationTabReplaced(addedTabId, removedTabId) {
  const record = records.get(removedTabId);
  if (record) {
    record.id = addedTabId;
    records.delete(removedTabId);
    records.set(addedTabId, record);
  }
  controller.replaceTabId(addedTabId, removedTabId);
  await workspace.replaceTabId(addedTabId, removedTabId);
}
