import { onAutoPreparationTabReplaced } from '../auto-preparation/service.js';
import { isFiniteNumber, isValidWindowId } from '../../shared/guards.js';
import { logDebug, logWarn, withErrorLogging } from '../../shared/log.js';
import { getTab } from './chrome-tabs.js';
import { updateSortStateAndBroadcast } from '../sorting/update-sort-state.js';
import { collectPlaybackMetricsBatch } from '../playback/collect.js';
import {
  canManageWindow,
  deleteTabFromOrderedWindow,
  deleteTabRecord,
  getTrackedWindowId,
} from '../windows/store.js';
import { reconcileWindowTabRecords } from './reconcile-window.js';
import { isYouTubeVideoPage } from '../../shared/youtube/urls.js';
import { removeAutoPreparedTab, transferAutoPreparedTab } from '../auto-preparation/session-cache.js';

const RECONCILE_DEBOUNCE_MS = 200;
const pendingReconcilesByWindow = new Map();

function getPendingKey(windowId) {
  return isValidWindowId(windowId) ? String(windowId) : 'last-focused';
}

function scheduleWindowReconcile(windowId, { refreshTabId } = {}) {
  const key = getPendingKey(windowId);
  const pending = pendingReconcilesByWindow.get(key) ?? {
    windowId,
    refreshTabIds: new Set(),
    timerId: null,
  };
  if (isFiniteNumber(refreshTabId)) pending.refreshTabIds.add(refreshTabId);
  clearTimeout(pending.timerId);
  pending.timerId = setTimeout(() => {
    flushWindowReconcile(key).catch((error) => logDebug('scheduled reconcile failed', error));
  }, RECONCILE_DEBOUNCE_MS);
  pendingReconcilesByWindow.set(key, pending);
}

async function flushWindowReconcile(key) {
  const pending = pendingReconcilesByWindow.get(key);
  if (!pending) return;
  pendingReconcilesByWindow.delete(key);
  const reconciliation = await reconcileWindowTabRecords(pending.windowId);
  if (!reconciliation.applied) return;
  await collectPlaybackMetricsBatch(pending.refreshTabIds);
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
  chrome.tabs.onReplaced?.addListener(
    withErrorLogging('tabs.onReplaced', async (addedTabId, removedTabId) => {
      await onAutoPreparationTabReplaced(addedTabId, removedTabId);
      await transferAutoPreparedTab(addedTabId, removedTabId);
      const tab = await getTab(addedTabId);
      if (canManageWindow(tab.windowId)) scheduleWindowReconcile(tab.windowId);
    }),
  );
  chrome.tabs.onUpdated.addListener(
    withErrorLogging('tabs.onUpdated', async (tabId, changeInfo, tab) => {
      if (!tab) return;
      if (changeInfo.discarded === false || changeInfo.url ||
          (changeInfo.status === 'loading' && !tab.discarded)) {
        void removeAutoPreparedTab(tabId).catch(error => logDebug('autoPrepared tab cleanup failed', error));
      }
      if (!canManageWindow(tab.windowId)) return;
      if (
        Object.prototype.hasOwnProperty.call(changeInfo, 'discarded') ||
        changeInfo.status === 'complete' ||
        changeInfo.status === 'loading' ||
        changeInfo.url
      ) {
        scheduleWindowReconcile(tab.windowId, {
          refreshTabId:
            !tab.discarded && isYouTubeVideoPage(tab.url) ? tabId : undefined,
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
        refreshTabId: activeInfo.tabId,
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
    void removeAutoPreparedTab(tabId).catch(error => logDebug('autoPrepared tab cleanup failed', error));
    if (!canManageWindow(removeInfo?.windowId)) return;
    deleteTabFromOrderedWindow(tabId);
    deleteTabRecord(tabId);
    if (removeInfo?.isWindowClosing && removeInfo.windowId === getTrackedWindowId()) {
      if (typeof onTrackedWindowClosed === 'function') {
        onTrackedWindowClosed();
      }
      return;
    }
    updateSortStateAndBroadcast();
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
              getTrackedWindowId() != null &&
              tab.windowId !== getTrackedWindowId()
            ) {
              return;
            }
            windowIdForUpdate = tab.windowId;
          } catch (error) {
            logDebug(`getTab failed for history update ${details.tabId}`, error);
            return;
          }
        } else if (getTrackedWindowId() != null) {
          windowIdForUpdate = getTrackedWindowId();
        }

        scheduleWindowReconcile(windowIdForUpdate, {
          refreshTabId: details.tabId,
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
