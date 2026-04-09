import { isFiniteNumber, isValidWindowId } from '../shared/utils.js';
import { logDebug, logWarn, withErrorLogging } from '../shared/log.js';
import { getTab } from './chrome-tabs.js';
import { recomputeSortState } from './sort-state.js';
import { canHandleWindow, trackingState } from './tracking-state.js';
import { refreshTabPlaybackState } from './tab-playback-state.js';
import { syncTrackedTabsForWindow } from './tracked-tab-sync.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';

function syncForWindowChange(label, resolveWindowId) {
  return withErrorLogging(label, async (...args) => {
    const windowId = resolveWindowId(...args);
    if (!isValidWindowId(windowId)) return;
    if (!canHandleWindow(windowId)) return;
    await syncTrackedTabsForWindow(windowId);
  });
}

export function registerTabAndNavigationListeners({ onTrackedWindowClosed } = {}) {
  chrome.tabs.onUpdated.addListener(
    withErrorLogging('tabs.onUpdated', async (tabId, changeInfo, tab) => {
      if (!tab) return;
      if (!canHandleWindow(tab.windowId)) return;
      if (
        Object.prototype.hasOwnProperty.call(changeInfo, 'discarded') ||
        changeInfo.status === 'complete' ||
        changeInfo.status === 'loading' ||
        changeInfo.url
      ) {
        await syncTrackedTabsForWindow(tab.windowId);
        if (isWatchOrShortsPage(tab.url)) {
          await refreshTabPlaybackState(tabId);
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
      if (!canHandleWindow(activeInfo.windowId)) return;
      await syncTrackedTabsForWindow(activeInfo.windowId);
      if (!isFiniteNumber(activeInfo.tabId)) return;
      const tab = await getTab(activeInfo.tabId);
      if (!isWatchOrShortsPage(tab?.url)) return;
      await refreshTabPlaybackState(activeInfo.tabId);
    }),
  );

  chrome.tabs.onDetached.addListener(
    syncForWindowChange('tabs.onDetached', (_tabId, detachInfo) => detachInfo?.oldWindowId),
  );

  chrome.tabs.onAttached.addListener(
    syncForWindowChange('tabs.onAttached', (_tabId, attachInfo) => attachInfo?.newWindowId),
  );

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (!canHandleWindow(removeInfo?.windowId)) return;
    delete trackingState.trackedTabsById[tabId];
    if (removeInfo?.isWindowClosing && removeInfo.windowId === trackingState.trackedWindowId) {
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
              trackingState.trackedWindowId != null &&
              tab.windowId !== trackingState.trackedWindowId
            ) {
              return;
            }
            windowIdForUpdate = tab.windowId;
          } catch (error) {
            logDebug(`getTab failed for history update ${details.tabId}`, error);
            return;
          }
        } else if (trackingState.trackedWindowId != null) {
          windowIdForUpdate = trackingState.trackedWindowId;
        }

        await syncTrackedTabsForWindow(windowIdForUpdate);
        await refreshTabPlaybackState(details.tabId);
      }),
      { url: [{ hostContains: 'youtube.com' }] },
    );
  } else {
    logWarn(
      'webNavigation API unavailable (missing permission?); falling back to tabs.onUpdated only.',
    );
  }
}
