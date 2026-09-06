import { createPreparationController } from './controller.js';
import { getPreparation, setPreparation, getProgressWindowId, setProgressWindowId } from './state.js';
import { getTab, updateTab } from '../tabs/chrome-tabs.js';
import { getTabRecord, getTrackedWindowId, listTabRecords } from '../windows/store.js';
import { reconcileWindowTabRecords } from '../tabs/reconcile.js';
import { collectPlaybackMetrics } from '../playback/collect.js';
import { broadcastSnapshotUpdate } from '../tab-snapshot.js';
import { hasReadyRemainingTime } from '../../shared/tabs/sort-readiness.js';
import { getYouTubeVideoId } from '../../shared/youtube/urls.js';

function requireWindow(windowId) {
  if (getTrackedWindowId() !== windowId) throw new Error('Stopped because the tracked window changed');
}

const controller = createPreparationController({
  async inspect(tabId, windowId) {
    requireWindow(windowId);
    let tab;
    try { tab = await getTab(tabId); } catch { return null; }
    requireWindow(windowId);
    if (tab.windowId !== windowId) return null;
    const record = getTabRecord(tabId);
    const identity = getYouTubeVideoId(tab.url);
    return {
      active: tab.active, identity,
      excluded: tab.pinned || record?.isLive || !identity,
      loaded: !tab.discarded && tab.status === 'complete',
      ready: !tab.discarded && tab.status === 'complete' &&
        identity === getYouTubeVideoId(record?.url) && hasReadyRemainingTime(record),
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
  publish(state) {
    setPreparation(state);
    broadcastSnapshotUpdate({ force: true });
  },
});

let starting = false;
export async function startPreparation(message) {
  if (starting || getPreparation().status === 'running') return { ok: false, error: 'alreadyPreparing' };
  starting = true;
  try {
    const result = await reconcileWindowTabRecords(message.windowId, { force: true });
    if (!result.applied) return { ok: false, error: 'windowUnavailable' };
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
      url: chrome.runtime.getURL('popup/preparation.html'),
      type: 'popup', focused: false, width: 440, height: 260,
    });
    setProgressWindowId(progress.id);
    requireWindow(result.windowId);
    return controller.start(result.windowId, items);
  } finally { starting = false; }
}

export function stopPreparation() {
  controller.stop();
  return { ok: true, preparation: getPreparation() };
}

export function onPreparationWindowRemoved(windowId) {
  if (windowId === getProgressWindowId()) {
    setProgressWindowId(null);
    controller.stop('Stopped because the progress window was closed');
  }
}
