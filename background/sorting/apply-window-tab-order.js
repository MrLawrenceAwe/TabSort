import { isValidWindowId } from '../../shared/guards.js';
import { loadSortOptions } from '../../shared/storage.js';
import { hasReadyRemainingTime } from '../sort-readiness.js';
import { listWindowTabs, moveTabsInOrder } from '../chrome-tabs.js';
import { windowSessionState } from '../window-session.js';
import { setWindowId } from '../window-session-store.js';
import { buildNonYoutubeOrder, buildYoutubeTabOrder } from './build-window-tab-order.js';

export async function reorderWindowTabs(windowId = windowSessionState.windowId) {
  const targetSortableTabIds = windowSessionState.targetSortableTabIds.slice();

  const readyTabIds = targetSortableTabIds.filter((tabId) => {
    const record = windowSessionState.tabRecordsById[tabId];
    return hasReadyRemainingTime(record);
  });

  if (readyTabIds.length < 2) return;

  const options = await loadSortOptions();
  const targetWindowId = isValidWindowId(windowId)
    ? setWindowId(windowId, { force: true })
    : null;
  const tabs = await listWindowTabs(targetWindowId);
  if (!Array.isArray(tabs) || tabs.length === 0) return;

  const tabsByIndex = tabs.slice().sort((a, b) => a.index - b.index);
  const pinnedCount = tabsByIndex.filter((tab) => tab?.pinned).length;
  const unpinnedTabs = tabsByIndex.filter((tab) => tab && !tab.pinned);

  const youtubeOrder = buildYoutubeTabOrder(unpinnedTabs, targetSortableTabIds);
  const nonYoutubeOrder = buildNonYoutubeOrder(
    unpinnedTabs,
    Boolean(options.groupNonYoutubeTabsByDomain),
  );
  const finalTabOrder = [...youtubeOrder, ...nonYoutubeOrder];

  if (finalTabOrder.length) {
    await moveTabsInOrder(finalTabOrder, pinnedCount);
  }
}
