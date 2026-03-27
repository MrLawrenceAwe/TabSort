import { isFiniteNumber, isValidWindowId } from '../shared/guards.js';
import { backgroundStore } from './store.js';
import { getTab } from './chrome-tabs.js';
import { recomputeSortState } from './sort-state.js';
import { refreshTrackedTab, syncTrackedWindowTabs } from './tracked-tabs.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';
import { shouldHandleWindow, withErrorLogging } from './listener-helpers.js';

function syncForWindowChange(label, resolveWindowId) {
  return withErrorLogging(label, async (...args) => {
    const windowId = resolveWindowId(...args);
    if (!isValidWindowId(windowId)) return;
    if (!shouldHandleWindow(windowId)) return;
    await syncTrackedWindowTabs(windowId);
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
        await syncTrackedWindowTabs(tab.windowId);
        if (isWatchOrShortsPage(tab.url)) {
          await refreshTrackedTab(tabId);
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
      if (!shouldHandleWindow(activeInfo.windowId)) return;
      await syncTrackedWindowTabs(activeInfo.windowId);
      if (!isFiniteNumber(activeInfo.tabId)) return;
      const tab = await getTab(activeInfo.tabId);
      if (!isWatchOrShortsPage(tab?.url)) return;
      await refreshTrackedTab(activeInfo.tabId);
    }),
  );

  chrome.tabs.onDetached.addListener(
    syncForWindowChange('tabs.onDetached', (_tabId, detachInfo) => detachInfo?.oldWindowId),
  );

  chrome.tabs.onAttached.addListener(
    syncForWindowChange('tabs.onAttached', (_tabId, attachInfo) => attachInfo?.newWindowId),
  );

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (!shouldHandleWindow(removeInfo?.windowId)) return;
    delete backgroundStore.trackedTabsById[tabId];
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

        await syncTrackedWindowTabs(windowIdForUpdate);
        await refreshTrackedTab(details.tabId);
      }),
      { url: [{ hostContains: 'youtube.com' }] },
    );
  } else {
    console.warn(
      '[TabSort] webNavigation API unavailable (missing permission?); falling back to tabs.onUpdated only.',
    );
  }
}
