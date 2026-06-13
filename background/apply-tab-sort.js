import { isValidWindowId } from '../shared/guards.js';
import { loadSortOptions } from '../shared/storage.js';
import { hasReadyRemainingTime } from './remaining-time-readiness.js';
import { listWindowTabs, moveTabsInOrder } from './chrome-api.js';
import { setTrackedWindowId, trackedWindowStateView } from './tracked-window-store.js';
import { buildOtherTabOrder, buildYoutubeTabOrder } from './tab-order/build-tab-move-order.js';

export async function applyTabSort(windowId = trackedWindowStateView.windowId) {
  const plannedVideoTabOrder = trackedWindowStateView.plannedVideoTabOrder.slice();

  const readyTabIds = plannedVideoTabOrder.filter((tabId) => {
    const record = trackedWindowStateView.tabRecordsById[tabId];
    return hasReadyRemainingTime(record);
  });

  if (readyTabIds.length < 2) {
    return { ok: true, movedCount: 0, skippedReason: 'notEnoughReadyTabs' };
  }

  const options = await loadSortOptions();
  const targetWindowId = isValidWindowId(windowId)
    ? setTrackedWindowId(windowId, { force: true })
    : null;
  const tabs = await listWindowTabs(targetWindowId);
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return { ok: false, movedCount: 0, skippedReason: 'tabsUnavailable' };
  }

  const tabsByIndex = tabs.slice().sort((a, b) => a.index - b.index);
  const pinnedCount = tabsByIndex.filter((tab) => tab?.pinned).length;
  const unpinnedTabs = tabsByIndex.filter((tab) => tab && !tab.pinned);

  const youtubeOrder = buildYoutubeTabOrder(unpinnedTabs, plannedVideoTabOrder);
  const nonYoutubeOrder = buildOtherTabOrder(
    unpinnedTabs,
    Boolean(options.groupOtherTabsBySite),
  );
  const finalTabOrder = [...youtubeOrder, ...nonYoutubeOrder];

  if (!finalTabOrder.length) {
    return { ok: true, movedCount: 0, skippedReason: 'emptySortOrder' };
  }

  const initialTabIds = new Set(tabs.map((tab) => tab.id));
  if (!finalTabOrder.every((tabId) => initialTabIds.has(tabId))) {
    return { ok: false, movedCount: 0, skippedReason: 'staleSortOrder' };
  }

  const results = await moveTabsInOrder(finalTabOrder, pinnedCount);
  const movedCount = results.filter((result) => result.ok).length;
  const failedCount = results.length - movedCount;
  return { ok: failedCount === 0, movedCount, failedCount };
}
