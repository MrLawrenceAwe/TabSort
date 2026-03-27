import { isFiniteNumber, isValidWindowId } from '../shared/guards.js';
import { backgroundStore } from './background-store.js';
import { getTab } from './tab-service.js';
import { recomputeSortState } from './sort-state.js';
import { refreshTabMetrics, syncTrackedTabs } from './tab-sync.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';
import { shouldHandleWindow, withErrorLogging } from './listener-helpers.js';

function syncForTabWindowChange(label, getWindowId) {
  return withErrorLogging(label, async (...args) => {
    const windowId = getWindowId(...args);
    if (!isValidWindowId(windowId)) return;
    if (!shouldHandleWindow(windowId)) return;
    await syncTrackedTabs(windowId);
  });
}

export function registerTabAndNavigationListeners({ onTrackedWindowClosed } = {}) {
  chrome.tabs.onUpdated.addListener(
    withErrorLogging('tabs.onUpdated', async (tabId, changeInfo, tab) => {
      if (!tab) return;
      if (!shouldHandleWindow(tab.windowId)) return;
      if (
        Object.prototype.hasOwnProperty.call(changeInfo, 'discarded') ||
        changeInfo.status === 'complete' ||
        changeInfo.status === 'loading' ||
        changeInfo.url
      ) {
        await syncTrackedTabs(tab.windowId);
        if (isWatchOrShortsPage(tab.url)) {
          await refreshTabMetrics(tabId);
        }
      }
    }),
  );

  chrome.tabs.onMoved.addListener(
    syncForTabWindowChange('tabs.onMoved', (_tabId, moveInfo) => moveInfo?.windowId),
  );

  chrome.tabs.onActivated.addListener(
    withErrorLogging('tabs.onActivated', async (activeInfo) => {
      if (!isValidWindowId(activeInfo?.windowId)) return;
      if (!shouldHandleWindow(activeInfo.windowId)) return;
      await syncTrackedTabs(activeInfo.windowId);
      if (!isFiniteNumber(activeInfo.tabId)) return;
      const tab = await getTab(activeInfo.tabId);
      if (!isWatchOrShortsPage(tab?.url)) return;
      await refreshTabMetrics(activeInfo.tabId);
    }),
  );

  chrome.tabs.onDetached.addListener(
    syncForTabWindowChange('tabs.onDetached', (_tabId, detachInfo) => detachInfo?.oldWindowId),
  );

  chrome.tabs.onAttached.addListener(
    syncForTabWindowChange('tabs.onAttached', (_tabId, attachInfo) => attachInfo?.newWindowId),
  );

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (!shouldHandleWindow(removeInfo?.windowId)) return;
    delete backgroundStore.trackedVideoTabsById[tabId];
    if (removeInfo?.isWindowClosing && removeInfo.windowId === backgroundStore.trackedWindowId) {
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
              backgroundStore.trackedWindowId != null &&
              tab.windowId !== backgroundStore.trackedWindowId
            ) {
              return;
            }
            windowIdForUpdate = tab.windowId;
          } catch (_) {
            return;
          }
        } else if (backgroundStore.trackedWindowId != null) {
          windowIdForUpdate = backgroundStore.trackedWindowId;
        }

        await syncTrackedTabs(windowIdForUpdate);
        await refreshTabMetrics(details.tabId);
      }),
      { url: [{ hostContains: 'youtube.com' }] },
    );
  } else {
    console.warn(
      '[TabSort] webNavigation API unavailable (missing permission?); falling back to tabs.onUpdated only.',
    );
  }
}
