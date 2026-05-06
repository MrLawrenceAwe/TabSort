import { isFiniteNumber, isValidWindowId } from '../shared/guards.js';
import { logDebug, logWarn, withErrorLogging } from '../shared/log.js';
import { getTab } from './chrome-tabs.js';
import { recomputeSortState } from './sort-state.js';
import { refreshTabPlaybackMetrics } from './tab-playback-metrics.js';
import { windowSessionState } from './window-session-state.js';
import { canManageWindow, removeTabRecordFromState } from './window-session-store.js';
import { syncWindowTabRecords } from './tab-record-sync.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';

function syncForWindowChange(label, resolveWindowId) {
  return withErrorLogging(label, async (...args) => {
    const windowId = resolveWindowId(...args);
    if (!isValidWindowId(windowId)) return;
    if (!canManageWindow(windowId)) return;
    await syncWindowTabRecords(windowId);
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
        await syncWindowTabRecords(tab.windowId);
        if (isWatchOrShortsPage(tab.url)) {
          await refreshTabPlaybackMetrics(tabId);
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
      await syncWindowTabRecords(activeInfo.windowId);
      if (!isFiniteNumber(activeInfo.tabId)) return;
      const tab = await getTab(activeInfo.tabId);
      if (!isWatchOrShortsPage(tab?.url)) return;
      await refreshTabPlaybackMetrics(activeInfo.tabId);
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
    removeTabRecordFromState(tabId);
    if (removeInfo?.isWindowClosing && removeInfo.windowId === windowSessionState.windowId) {
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
              windowSessionState.windowId != null &&
              tab.windowId !== windowSessionState.windowId
            ) {
              return;
            }
            windowIdForUpdate = tab.windowId;
          } catch (error) {
            logDebug(`getTab failed for history update ${details.tabId}`, error);
            return;
          }
        } else if (windowSessionState.windowId != null) {
          windowIdForUpdate = windowSessionState.windowId;
        }

        await syncWindowTabRecords(windowIdForUpdate);
        await refreshTabPlaybackMetrics(details.tabId);
      }),
      { url: [{ hostContains: 'youtube.com' }] },
    );
  } else {
    logWarn(
      'webNavigation API unavailable (missing permission?); falling back to tabs.onUpdated only.',
    );
  }
}
