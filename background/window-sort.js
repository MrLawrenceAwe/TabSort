import { isValidWindowId } from '../shared/guards.js';
import { loadSortOptions } from '../shared/storage.js';
import { hasFreshRemainingTime } from '../shared/tab-metrics.js';
import { backgroundStore } from './background-store.js';
import { buildNonYoutubeOrder, buildYoutubeTabOrder } from './sort-strategy.js';
import { getTabsForTrackedWindow, moveTabsSequentially } from './tab-service.js';

export async function sortWindowTabs(windowId = backgroundStore.trackedWindowId) {
  const targetSortOrderTabIds = backgroundStore.targetSortOrderTabIds.slice();

  const readyTabIds = targetSortOrderTabIds.filter((tabId) => {
    const record = backgroundStore.trackedVideoTabsById[tabId];
    return hasFreshRemainingTime(record);
  });

  if (readyTabIds.length < 2) return;

  const options = await loadSortOptions();
  const targetWindowId = isValidWindowId(windowId) ? windowId : null;
  const { tabs } = await getTabsForTrackedWindow(
    targetWindowId,
    targetWindowId != null ? { force: true } : undefined,
  );
  if (!Array.isArray(tabs) || tabs.length === 0) return;

  const tabsByIndex = tabs.slice().sort((a, b) => a.index - b.index);
  const pinnedCount = tabsByIndex.filter((tab) => tab?.pinned).length;
  const unpinnedTabs = tabsByIndex.filter((tab) => tab && !tab.pinned);

  const youtubeOrder = buildYoutubeTabOrder(unpinnedTabs, targetSortOrderTabIds);
  const nonYoutubeOrder = buildNonYoutubeOrder(
    unpinnedTabs,
    Boolean(options.groupNonYoutubeTabsByDomain),
  );
  const finalTabOrder = [...youtubeOrder, ...nonYoutubeOrder];

  if (finalTabOrder.length) {
    await moveTabsSequentially(finalTabOrder, pinnedCount);
  }
}
