import { isFiniteNumber, isValidWindowId } from '../shared/guards.js';
import { logDebug, logWarn, withErrorLogging } from '../shared/log.js';
import { getTab } from './chrome-tabs.js';
import { recomputeSortState } from './sort-state.js';
import { collectPlaybackMetrics } from './collect-playback-metrics.js';
import {
  canManageWindow,
  trackedWindowSnapshot,
  deleteTabRecord,
} from './tracked-window-store.js';
import { reconcileWindowTabRecords } from './tab-record-reconciler.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';

function syncForWindowChange(label, resolveWindowId) {
  return withErrorLogging(label, async (...args) => {
    const windowId = resolveWindowId(...args);
    if (!isValidWindowId(windowId)) return;
    if (!canManageWindow(windowId)) return;
    await reconcileWindowTabRecords(windowId);
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
        await reconcileWindowTabRecords(tab.windowId);
        if (isWatchOrShortsPage(tab.url)) {
          await collectPlaybackMetrics(tabId);
        }
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
      await reconcileWindowTabRecords(activeInfo.windowId);
      if (!isFiniteNumber(activeInfo.tabId)) return;
      const tab = await getTab(activeInfo.tabId);
      if (!isWatchOrShortsPage(tab?.url)) return;
      await collectPlaybackMetrics(activeInfo.tabId);
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
    if (removeInfo?.isWindowClosing && removeInfo.windowId === trackedWindowSnapshot.windowId) {
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
        if (!isWatchOrShortsPage(details.url)) return;

        let windowIdForUpdate = null;
        if (typeof details.tabId === 'number') {
          try {
            const tab = await getTab(details.tabId);
            if (
              trackedWindowSnapshot.windowId != null &&
              tab.windowId !== trackedWindowSnapshot.windowId
            ) {
              return;
            }
            windowIdForUpdate = tab.windowId;
          } catch (error) {
            logDebug(`getTab failed for history update ${details.tabId}`, error);
            return;
          }
        } else if (trackedWindowSnapshot.windowId != null) {
          windowIdForUpdate = trackedWindowSnapshot.windowId;
        }

        await reconcileWindowTabRecords(windowIdForUpdate);
        await collectPlaybackMetrics(details.tabId);
      }),
      { url: [{ hostContains: 'youtube.com' }] },
    );
  } else {
    logWarn(
      'webNavigation API unavailable (missing permission?); falling back to tabs.onUpdated only.',
    );
  }
}
