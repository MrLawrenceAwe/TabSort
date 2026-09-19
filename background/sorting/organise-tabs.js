import { isValidWindowId } from '../../shared/guards.js';
import { loadPreferences } from '../../shared/preferences.js';
import { hasReadyRemainingTime } from '../../shared/tabs/sort-readiness.js';
import { listWindowTabs, moveTabsInOrder } from '../tabs/chrome-tabs.js';
import {
  getSortState,
  getTabRecordsById,
  getTrackedWindowId,
  isSyncTokenCurrent,
} from '../windows/tracked-window-store.js';
import { buildOtherTabOrder, buildYouTubeTabOrder } from './move-order.js';

export async function organiseTabs(
  windowId = getTrackedWindowId(),
  { expectedSyncToken = null } = {},
) {
  if (expectedSyncToken != null && !isSyncTokenCurrent(expectedSyncToken)) {
    return { ok: false, movedCount: 0, skippedReason: 'windowSyncSuperseded' };
  }

  const targetVideoTabOrder = getSortState().targetVideoTabOrder;

  const tabRecordsById = getTabRecordsById();
  const readyTabIds = targetVideoTabOrder.filter((tabId) => {
    const record = tabRecordsById[tabId];
    return hasReadyRemainingTime(record);
  });

  if (readyTabIds.length < 2) {
    return { ok: true, movedCount: 0, skippedReason: 'notEnoughReadyTabs' };
  }

  const options = await loadPreferences();
  const targetWindowId = isValidWindowId(windowId) ? windowId : null;
  const tabs = await listWindowTabs(targetWindowId);
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return { ok: false, movedCount: 0, skippedReason: 'tabsUnavailable' };
  }

  const tabsByIndex = tabs.slice().sort((a, b) => a.index - b.index);
  const pinnedCount = tabsByIndex.filter((tab) => tab?.pinned).length;
  const unpinnedTabs = tabsByIndex.filter((tab) => tab && !tab.pinned);

  const youtubeOrder = buildYouTubeTabOrder(unpinnedTabs, targetVideoTabOrder);
  const nonYouTubeOrder = buildOtherTabOrder(
    unpinnedTabs,
    Boolean(options.groupOtherTabsBySite),
  );
  const finalTabOrder = [...youtubeOrder, ...nonYouTubeOrder];

  if (!finalTabOrder.length) {
    return { ok: true, movedCount: 0, skippedReason: 'emptySortOrder' };
  }

  const initialTabIds = new Set(tabs.map((tab) => tab.id));
  if (!finalTabOrder.every((tabId) => initialTabIds.has(tabId))) {
    return { ok: false, movedCount: 0, skippedReason: 'staleSortOrder' };
  }

  if (expectedSyncToken != null && !isSyncTokenCurrent(expectedSyncToken)) {
    return { ok: false, movedCount: 0, skippedReason: 'windowSyncSuperseded' };
  }

  return moveTabsInOrder(
    finalTabOrder,
    pinnedCount,
    unpinnedTabs.map((tab) => tab.id),
  );
}
