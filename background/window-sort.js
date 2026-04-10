import { isValidWindowId } from '../shared/guards.js';
import { loadSortOptions } from '../shared/storage.js';
import { hasReadyRemainingTime } from './sort-state.js';
import { managedState, setManagedWindowId } from './managed-state.js';
import { buildNonYoutubeOrder, buildYoutubeTabOrder } from './sort-strategy.js';
import { listWindowTabs, moveTabsInOrder } from './chrome-tabs.js';

export async function sortWindowTabs(windowId = managedState.managedWindowId) {
  const targetOrder = managedState.targetOrder.slice();

  const readyTabIds = targetOrder.filter((tabId) => {
    const record = managedState.tabRecordsById[tabId];
    return hasReadyRemainingTime(record);
  });

  if (readyTabIds.length < 2) return;

  const options = await loadSortOptions();
  const targetWindowId = isValidWindowId(windowId)
    ? setManagedWindowId(windowId, { force: true })
    : null;
  const tabs = await listWindowTabs(targetWindowId);
  if (!Array.isArray(tabs) || tabs.length === 0) return;

  const tabsByIndex = tabs.slice().sort((a, b) => a.index - b.index);
  const pinnedCount = tabsByIndex.filter((tab) => tab?.pinned).length;
  const unpinnedTabs = tabsByIndex.filter((tab) => tab && !tab.pinned);

  const youtubeOrder = buildYoutubeTabOrder(unpinnedTabs, targetOrder);
  const nonYoutubeOrder = buildNonYoutubeOrder(
    unpinnedTabs,
    Boolean(options.groupNonYoutubeTabsByDomain),
  );
  const finalTabOrder = [...youtubeOrder, ...nonYoutubeOrder];

  if (finalTabOrder.length) {
    await moveTabsInOrder(finalTabOrder, pinnedCount);
  }
}
