import { isFiniteNumber, isValidWindowId } from '../../shared/guards.js';
import { logDebug, logWarn, withErrorLogging } from '../../shared/log.js';
import { getTab } from './chrome-tabs.js';
import { recomputeSortState } from '../sorting/state.js';
import { collectPlaybackMetrics } from '../playback/collect.js';
import {
  canManageWindow,
  deleteTabRecord,
  trackedWindow,
} from '../windows/store.js';
import { reconcileWindowTabRecords } from './reconcile.js';
import { isYouTubeVideoPage } from '../youtube/urls.js';

const RECONCILE_DEBOUNCE_MS = 200;
const pendingReconcilesByWindow = new Map();

function getPendingKey(windowId) {
  return isValidWindowId(windowId) ? String(windowId) : 'last-focused';
}

function scheduleWindowReconcile(windowId, { force = false, afterReconcile } = {}) {
  const key = getPendingKey(windowId);
  const existing = pendingReconcilesByWindow.get(key);
  if (existing) {
    clearTimeout(existing.timerId);
    existing.force = existing.force || force;
    if (typeof afterReconcile === 'function') {
      existing.afterReconcile.push(afterReconcile);
    }
    existing.timerId = setTimeout(() => {
      flushWindowReconcile(key).catch((error) => logDebug('scheduled reconcile failed', error));
    }, RECONCILE_DEBOUNCE_MS);
    return;
  }

  const pending = {
    windowId,
    force,
    afterReconcile: typeof afterReconcile === 'function' ? [afterReconcile] : [],
    timerId: null,
  };
  pending.timerId = setTimeout(() => {
    flushWindowReconcile(key).catch((error) => logDebug('scheduled reconcile failed', error));
  }, RECONCILE_DEBOUNCE_MS);
  pendingReconcilesByWindow.set(key, pending);
}

async function flushWindowReconcile(key) {
  const pending = pendingReconcilesByWindow.get(key);
  if (!pending) return;
  pendingReconcilesByWindow.delete(key);
  await reconcileWindowTabRecords(pending.windowId, pending.force ? { force: true } : undefined);
  for (const callback of pending.afterReconcile) {
    await callback();
  }
}

function syncForWindowChange(label, resolveWindowId) {
  return withErrorLogging(label, async (...args) => {
    const windowId = resolveWindowId(...args);
    if (!isValidWindowId(windowId)) return;
    if (!canManageWindow(windowId)) return;
    scheduleWindowReconcile(windowId);
  });
}

export function registerTabAndNavigationListeners({ onTrackedWindowClosed } = {}) {
  chrome.tabs.onUpdated.addListener(
    withErrorLogging('tabs.onUpdated', async (tabId, changeInfo, tab) => {
      if (!tab) return;
      if (!canManageWindow(tab.windowId)) return;
      if (
        Object.prototype.hasOwnProperty.call(changeInfo, 'discarded') ||
        changeInfo.status === 'complete' ||
        changeInfo.status === 'loading' ||
        changeInfo.url
      ) {
        scheduleWindowReconcile(tab.windowId, {
          afterReconcile: isYouTubeVideoPage(tab.url)
            ? () => collectPlaybackMetrics(tabId)
            : undefined,
        });
      }
    }),
  );

  chrome.tabs.onMoved.addListener(
    syncForWindowChange('tabs.onMoved', (_tabId, moveInfo) => moveInfo?.windowId),
  );

  chrome.tabs.onActivated.addListener(
    withErrorLogging('tabs.onActivated', async (activeInfo) => {
      if (!isValidWindowId(activeInfo?.windowId)) return;
      if (!canManageWindow(activeInfo.windowId)) return;
      if (!isFiniteNumber(activeInfo.tabId)) return;
      scheduleWindowReconcile(activeInfo.windowId, {
        afterReconcile: async () => {
          const tab = await getTab(activeInfo.tabId);
          if (!isYouTubeVideoPage(tab?.url)) return;
          await collectPlaybackMetrics(activeInfo.tabId);
        },
      });
    }),
  );

  chrome.tabs.onDetached.addListener(
    syncForWindowChange('tabs.onDetached', (_tabId, detachInfo) => detachInfo?.oldWindowId),
  );

  chrome.tabs.onAttached.addListener(
    syncForWindowChange('tabs.onAttached', (_tabId, attachInfo) => attachInfo?.newWindowId),
  );

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (!canManageWindow(removeInfo?.windowId)) return;
    deleteTabRecord(tabId);
    if (removeInfo?.isWindowClosing && removeInfo.windowId === trackedWindow.windowId) {
      if (typeof onTrackedWindowClosed === 'function') {
        onTrackedWindowClosed();
      }
      return;
    }
    recomputeSortState();
  });

  if (chrome.webNavigation?.onHistoryStateUpdated) {
    chrome.webNavigation.onHistoryStateUpdated.addListener(
      withErrorLogging('webNavigation.onHistoryStateUpdated', async (details) => {
        if (details.frameId !== 0) return;
        if (!isYouTubeVideoPage(details.url)) return;

        let windowIdForUpdate = null;
        if (typeof details.tabId === 'number') {
          try {
            const tab = await getTab(details.tabId);
            if (
              trackedWindow.windowId != null &&
              tab.windowId !== trackedWindow.windowId
            ) {
              return;
            }
            windowIdForUpdate = tab.windowId;
          } catch (error) {
            logDebug(`getTab failed for history update ${details.tabId}`, error);
            return;
          }
        } else if (trackedWindow.windowId != null) {
          windowIdForUpdate = trackedWindow.windowId;
        }

        scheduleWindowReconcile(windowIdForUpdate, {
          afterReconcile: () => collectPlaybackMetrics(details.tabId),
        });
      }),
      { url: [{ hostContains: 'youtube.com' }] },
    );
  } else {
    logWarn(
      'webNavigation API unavailable (missing permission?); falling back to tabs.onUpdated only.',
    );
  }
}
