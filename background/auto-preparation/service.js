import { applyAutoPreparedTime, applyVideoMetricsUnavailable } from '../tabs/video-state.js';
import { createAutoPreparationRunner } from './runner.js';
import { createPreparationWorkspace } from './workspace.js';
import { setPreparingTabRecord } from './placeholder.js';
import { getAutoPreparation, autoPreparationState, getPreparationWindowId, setPreparationWindowId } from './state.js';
import { getTab, listWindowTabs, getTabLoadState } from '../tabs/chrome-tabs.js';
import { getTabRecord, getTrackedWindowId, setTabRecord } from '../windows/tracked-window-store.js';
import { reconcileTabRecord } from '../tabs/reconcile-tab-record.js';
import { reconcileWindowTabRecords } from '../tabs/reconcile-window.js';
import { derivePlaybackUpdate } from '../playback/derive-update.js';
import { applyPlaybackStateUpdate } from '../playback/apply-update.js';
import { logDebug } from '../../shared/log.js';
import { updateSortStateAndBroadcast } from '../sorting/update-sort-state.js';
import { hasReadyRemainingTime } from '../../shared/tabs/sort-readiness.js';
import { isPreparationCandidate } from '../../shared/tabs/preparation-eligibility.js';
import { getYouTubeVideoId } from '../../shared/youtube/urls.js';
import { RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { openTikTokPipForAutoPreparation } from '../integrations/tiktok-pip.js';
import { saveAutoPreparedTab } from './session-cache.js';
import { queueAutoPreparationToolbarIndicator } from '../toolbar-indicator.js';
import { createSilentPlaybackPreparation } from './silent-playback.js';
import { createPreparationFocusRecovery } from './focus-recovery.js';
import { TAB_LOAD_STATES } from '../../shared/tabs/constants.js';

const workspace = createPreparationWorkspace();
const silentPlayback = createSilentPlaybackPreparation();
const focusRecovery = createPreparationFocusRecovery();
// Preparation owns its records; browsing a different window can freely replace
// the popup's tracked-window store without interrupting this run.
const preparationRecordsById = new Map();
let startAbortController = null;
let recoveryPromise = null;

async function clearPreparationSession() {
  await silentPlayback.stop();
  await focusRecovery.reset();
  await workspace.finishSession();
  setPreparingTabRecord(null);
  preparationRecordsById.clear();
}

export function recoverAutoPreparation() {
  recoveryPromise ??= workspace.recover().catch(error => {
    recoveryPromise = null;
    throw error;
  });
  return recoveryPromise;
}

const runner = createAutoPreparationRunner({
  state: autoPreparationState,
  async inspect(tabId, windowId) {
    let tab;
    try { tab = await getTab(tabId); } catch { return null; }
    const isInPreparationWindow = workspace.transfer?.tabId === tabId && tab.windowId === workspace.windowId;
    if (!isInPreparationWindow && tab.windowId !== windowId) return null;
    // Queued tabs may have become ready through normal browsing since start.
    // Keep our private copy while preparing or when another window is tracked.
    const latest = !isInPreparationWindow && getTrackedWindowId() === windowId ? getTabRecord(tabId) : null;
    if (latest && getYouTubeVideoId(latest.url) === getYouTubeVideoId(tab.url)) preparationRecordsById.set(tabId, latest);
    const record = preparationRecordsById.get(tabId);
    const videoId = getYouTubeVideoId(tab.url);
    return {
      active: tab.active, discarded: tab.discarded, videoId,
      excluded: tab.pinned || record?.isLive || !videoId || (!isInPreparationWindow && tab.active),
      loaded: !tab.discarded && tab.status === 'complete',
      ready: !tab.discarded &&
        videoId === getYouTubeVideoId(record?.url) && hasReadyRemainingTime(record),
      remainingSeconds: record?.videoDetails?.remainingSeconds,
    };
  },
  async moveTabToPreparationWindow(tabId, windowId) {
    setPreparingTabRecord(preparationRecordsById.get(tabId));
    return workspace.moveTabToPreparationWindow(tabId, windowId);
  },
  async retryTabPreparation(tabId, _windowId, signal) {
    const tab = await getTab(tabId).catch(() => null);
    const record = preparationRecordsById.get(tabId);
    if (signal.aborted || !tab || !record || tab.pinned || record.isLive ||
        !tab.active || tab.windowId !== workspace.windowId ||
        workspace.transfer?.tabId !== tabId ||
        getYouTubeVideoId(tab.url) !== getYouTubeVideoId(record.url)) return false;
    applyVideoMetricsUnavailable(record);
    await silentPlayback.stop();
    await focusRecovery.reset();
    if (signal.aborted) return false;
    await chrome.tabs.reload(tabId);
    return true;
  },
  async refresh(tabId, _windowId, _remainingMs, signal) {
    let applied = false;
    let ownsTab = false;
    const record = preparationRecordsById.get(tabId);
    const windowId = workspace.windowId;
    const requestedUrl = record?.url;
    try {
      const tab = await getTab(tabId);
      if (signal.aborted || tab.pinned || record?.isLive || !tab.active ||
          tab.windowId !== windowId || workspace.transfer?.tabId !== tabId ||
          getYouTubeVideoId(tab.url) !== getYouTubeVideoId(requestedUrl)) return;
      ownsTab = true;
      if (!await silentPlayback.preparePlayback(tabId, getYouTubeVideoId(requestedUrl), signal)) return;
      const metrics = await silentPlayback.readMetrics(tabId, getYouTubeVideoId(requestedUrl), signal);
      const currentTab = await getTab(tabId);
      if (signal.aborted || !metrics || currentTab.windowId !== windowId ||
          workspace.transfer?.tabId !== tabId) return;
      const update = derivePlaybackUpdate({ metricsPayload: metrics, record, requestedUrl, currentTabUrl: currentTab.url });
      if (!update) return;
      // A valid media reading is usable before unrelated page requests finish.
      record.loadState = TAB_LOAD_STATES.LOADED;
      applyPlaybackStateUpdate(record, update, currentTab.url);
      applied = true;
    } finally {
      // A cached sample cannot establish stability while fresh reads fail.
      if (!applied) applyVideoMetricsUnavailable(record);
      if (ownsTab && !signal.aborted) {
        if (hasReadyRemainingTime(record)) await focusRecovery.release();
        else await focusRecovery.recover(windowId, signal);
      }
    }
  },
  async finishTabPreparation(tabId, _windowId, { autoPrepared, wasDiscarded }) {
    await silentPlayback.stop();
    await focusRecovery.reset();
    const record = preparationRecordsById.get(tabId);
    const returned = await workspace.returnTab();
    setPreparingTabRecord(null);
    if (!returned) return;
    const sameVideo = getYouTubeVideoId(returned.url) === getYouTubeVideoId(record?.url);
    if (autoPrepared && sameVideo && !(wasDiscarded && !returned.active)) {
      await saveAutoPreparedTab(record, { discarded: Boolean(returned.discarded), loading: returned.status === 'loading' });
    }
    // Never discard a tab the user has selected or navigated in the meantime.
    if (wasDiscarded && !returned.active && sameVideo) {
      // Chrome can replace the tab ID when discarding. Use the returned ID
      // instead of probing a tab that no longer exists. Persist the sleeping
      // result only after Chrome confirms that the discard happened: a failed
      // discard leaves the tab awake, where a sleeping cache would be stale.
      const discarded = await chrome.tabs.discard(tabId).catch(() => null);
      if (typeof discarded?.id === 'number' && discarded.discarded === true) {
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
  async cleanup({ completed } = {}) {
    await clearPreparationSession();
    // A normal run leaves only our progress page in the preparation window.
    // Removing it lets Chrome close that otherwise-empty window. Keep the page
    // after a stopped run so its status remains available to the user.
    if (completed) {
      const preparationWindowId = getPreparationWindowId();
      if (preparationWindowId != null) {
        // Removing the last tab closes the window and can synchronously fire
        // windows.onRemoved. Clear its ID first so that expected completion
        // cannot be mistaken for the user cancelling the preparation window.
        setPreparationWindowId(null);
        await workspace.removeProgressTabs(preparationWindowId);
      }
    }
  },
  publish(autoPreparation) {
    void queueAutoPreparationToolbarIndicator(autoPreparation);
    void chrome.runtime.sendMessage({
      type: RUNTIME_MESSAGE_TYPES.AUTO_PREPARATION_UPDATED, autoPreparation,
    }).catch(error => logDebug('auto-preparation broadcast failed', error));
  },
});

export async function startAutoPreparation(message) {
  if (startAbortController || getAutoPreparation().status === 'running') return { ok: false, error: 'alreadyAutoPreparing' };
  const startController = new AbortController();
  const { signal } = startController;
  startAbortController = startController;
  try {
    await recoverAutoPreparation();
    if (signal.aborted) return { ok: false, error: 'startCancelled' };
    await workspace.finishSession();
    if (signal.aborted) return { ok: false, error: 'startCancelled' };
    const result = await reconcileWindowTabRecords(message.windowId, { force: true });
    if (signal.aborted) return { ok: false, error: 'startCancelled' };
    if (!result.applied) return { ok: false, error: 'windowUnavailable' };
    // Use the reconciliation's snapshot throughout setup: focus changes can
    // replace the tracked-window store at any subsequent asynchronous boundary.
    const candidates = Object.values(result.tabRecordsById);
    const windowTabs = await listWindowTabs(result.windowId);
    if (signal.aborted) return { ok: false, error: 'startCancelled' };
    if (!windowTabs?.length) return { ok: false, error: 'windowUnavailable' };
    const items = candidates
      .filter(isPreparationCandidate)
      .sort((a, b) => a.index - b.index)
      .map(record => ({ id: record.id, videoId: getYouTubeVideoId(record.url),
        title: record.videoDetails?.title || record.browserTitle || 'YouTube video' }));
    if (!items.length) return { ok: false, error: 'noEligibleTabs' };
    const tiktokPip = message.openTikTokPip === true
      ? await openTikTokPipForAutoPreparation(result.windowId, { signal })
      : null;
    if (signal.aborted) return { ok: false, error: 'startCancelled' };
    const existing = getPreparationWindowId();
    if (existing != null) {
      const removed = await workspace.removeProgressTabs(existing, { signal });
      if (!removed) return { ok: false, error: 'startCancelled' };
      setPreparationWindowId(null);
      if (signal.aborted) return { ok: false, error: 'startCancelled' };
    }
    for (const record of candidates) preparationRecordsById.set(record.id, record);
    const windowId = await workspace.create(result.windowId);
    if (signal.aborted) {
      await workspace.discardUnstartedWorkspace();
      await clearPreparationSession();
      return { ok: false, error: 'startCancelled' };
    }
    setPreparationWindowId(windowId);
    return { ...runner.start(result.windowId, items), tiktokPip };
  } catch (error) {
    await clearPreparationSession();
    throw error;
  } finally {
    if (startAbortController === startController) startAbortController = null;
  }
}

export async function stopAutoPreparation() {
  if (startAbortController) {
    startAbortController.abort();
    return { ok: true, autoPreparation: getAutoPreparation() };
  }
  await runner.stop();
  return { ok: true, autoPreparation: getAutoPreparation() };
}

export async function stopAndReturnPreparationVideo(placeholderTab) {
  const url = new URL(placeholderTab?.url);
  const originalUrl = url.searchParams.get('url');
  const originalTabId = Number(url.searchParams.get('tabId'));
  url.search = '';
  url.hash = '';
  if (url.href !== chrome.runtime.getURL('preparation/placeholder.html') ||
      !Number.isInteger(placeholderTab?.id) || !Number.isInteger(originalTabId) ||
      originalTabId <= 0 || !getYouTubeVideoId(originalUrl)) {
    throw new Error('The original video URL is unavailable.');
  }
  // Keep the transfer reference: Chrome can replace its video ID while Stop
  // returns the tab. The placeholder URL still contains the original ID.
  const transfer = workspace.transfer?.placeholderId === placeholderTab.id ? workspace.transfer : null;
  await stopAutoPreparation();
  // Stop removes the placeholder. Finish selecting the video in the worker,
  // whose lifetime does not depend on that page remaining open.
  let tab;
  try { tab = await getTab(transfer?.tabId ?? originalTabId); } catch { /* Video was closed. */ }
  const selected = tab
    ? await chrome.tabs.update(tab.id, { active: true })
    : await chrome.tabs.update(placeholderTab.id, { url: originalUrl, active: true });
  await chrome.windows.update(selected.windowId, { focused: true });
  return { ok: true };
}

export function onAutoPreparationWindowRemoved(windowId) {
  if (windowId === getPreparationWindowId()) {
    setPreparationWindowId(null);
    void runner.stop('Preparation window closed. Use the placeholder to reopen its video.');
  }
}


export async function onAutoPreparationTabReplaced(addedTabId, removedTabId) {
  silentPlayback.replaceTabId(addedTabId, removedTabId);
  const record = preparationRecordsById.get(removedTabId);
  if (record) {
    record.id = addedTabId;
    preparationRecordsById.delete(removedTabId);
    preparationRecordsById.set(addedTabId, record);
  }
  runner.replaceTabId(addedTabId, removedTabId);
  await workspace.replaceTabId(addedTabId, removedTabId);
}
