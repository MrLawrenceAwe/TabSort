import { isValidWindowId } from '../shared/guards.js';
import { loadSortOptions } from '../shared/storage.js';
import { hasReadyRemainingTime } from './sort-readiness.js';
import { listWindowTabs, moveTabsInOrder } from './chrome-tabs.js';
import { trackedWindowSnapshot, setTrackedWindowId } from './window-store.js';
import { buildNonYoutubeOrder, buildYoutubeTabOrder } from './tab-order/build-tab-move-order.js';

export async function applyTabSort(windowId = trackedWindowSnapshot.windowId) {
  const plannedVideoTabIds = trackedWindowSnapshot.plannedVideoTabIds.slice();

  const readyTabIds = plannedVideoTabIds.filter((tabId) => {
    const record = trackedWindowSnapshot.tabRecordsById[tabId];
    return hasReadyRemainingTime(record);
  });

  if (readyTabIds.length < 2) return;

  const options = await loadSortOptions();
  const targetWindowId = isValidWindowId(windowId)
    ? setTrackedWindowId(windowId, { force: true })
    : null;
  const tabs = await listWindowTabs(targetWindowId);
  if (!Array.isArray(tabs) || tabs.length === 0) return;

  const tabsByIndex = tabs.slice().sort((a, b) => a.index - b.index);
  const pinnedCount = tabsByIndex.filter((tab) => tab?.pinned).length;
  const unpinnedTabs = tabsByIndex.filter((tab) => tab && !tab.pinned);

  const youtubeOrder = buildYoutubeTabOrder(unpinnedTabs, plannedVideoTabIds);
  const nonYoutubeOrder = buildNonYoutubeOrder(
    unpinnedTabs,
    Boolean(options.groupNonYoutubeTabsByDomain),
  );
  const finalTabOrder = [...youtubeOrder, ...nonYoutubeOrder];

  if (finalTabOrder.length) {
    await moveTabsInOrder(finalTabOrder, pinnedCount);
  }
}
