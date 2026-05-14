import { isValidWindowId } from '../shared/guards.js';
import { loadSortOptions } from '../shared/storage.js';
import { hasReadyRemainingTime } from './sort-readiness.js';
import { listWindowTabs, moveTabsInOrder } from './chrome-tabs.js';
import { readonlyTrackedWindowState, setTrackedWindowId } from './window-store.js';
import { buildNonYoutubeOrder, buildYoutubeTabOrder } from './tab-order/build-tab-move-order.js';

export async function applyTabSort(windowId = readonlyTrackedWindowState.windowId) {
  const targetVideoOrder = readonlyTrackedWindowState.targetVideoOrder.slice();

  const readyTabIds = targetVideoOrder.filter((tabId) => {
    const record = readonlyTrackedWindowState.tabRecordsById[tabId];
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

  const youtubeOrder = buildYoutubeTabOrder(unpinnedTabs, targetVideoOrder);
  const nonYoutubeOrder = buildNonYoutubeOrder(
    unpinnedTabs,
    Boolean(options.groupNonYoutubeTabsByDomain),
  );
  const finalTabOrder = [...youtubeOrder, ...nonYoutubeOrder];

  if (finalTabOrder.length) {
    await moveTabsInOrder(finalTabOrder, pinnedCount);
  }
}
