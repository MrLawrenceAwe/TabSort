import { isFiniteNumber, isValidWindowId } from '../shared/utils.js';
import { recomputeSorting } from './ordering.js';
import { backgroundState } from './state.js';
import { getTab } from './tab-service.js';
import { refreshTabMetrics, syncTrackedTabs } from './tracked-tabs.js';
import { isWatchOrShortsPage } from './youtube-url-utils.js';
import { shouldHandleWindow, withErrorLogging } from './listener-helpers.js';

function refreshForTabWindowChange(label, getWindowId) {
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
    refreshForTabWindowChange('tabs.onMoved', (_tabId, moveInfo) => moveInfo?.windowId),
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
    refreshForTabWindowChange('tabs.onDetached', (_tabId, detachInfo) => detachInfo?.oldWindowId),
  );

  chrome.tabs.onAttached.addListener(
    refreshForTabWindowChange('tabs.onAttached', (_tabId, attachInfo) => attachInfo?.newWindowId),
  );

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (!shouldHandleWindow(removeInfo?.windowId)) return;
    delete backgroundState.trackedVideoTabsById[tabId];
    if (removeInfo?.isWindowClosing && removeInfo.windowId === backgroundState.trackedWindowId) {
      if (typeof onTrackedWindowClosed === 'function') {
        onTrackedWindowClosed();
      }
      return;
    }
    recomputeSorting();
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
              backgroundState.trackedWindowId != null &&
              tab.windowId !== backgroundState.trackedWindowId
            ) {
              return;
            }
            windowIdForUpdate = tab.windowId;
          } catch (_) {
            return;
          }
        } else if (backgroundState.trackedWindowId != null) {
          windowIdForUpdate = backgroundState.trackedWindowId;
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
