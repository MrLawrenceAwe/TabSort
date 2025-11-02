import { popupState, updateSortingState } from './state.js';
import { refreshActiveContext, sendMessageWithWindow } from './runtime.js';
import {
  setActionAndStatusColumnsVisibility,
  updateHeaderFooter,
  addClassToAllRows,
} from './dom-utils.js';
import { insertRowCells } from './rows.js';
import {
  countTabsReadyForSorting,
  areReadyTabsContiguous,
  areReadyTabsAtFront,
  areRecordsWithKnownDurationOutOfOrder,
  allRecordsHaveKnownRemainingTimeAndAreInOrder,
} from './metrics.js';

export function requestAndRenderSnapshot() {
  return new Promise((resolve) => {
    sendMessageWithWindow('sendTabRecords', {}, (response) => {
      if (!response) {
        resolve();
        return;
      }
      Promise.resolve(renderSnapshot(response)).finally(resolve);
    });
  });
}

export async function renderSnapshot(snapshot) {
  if (!snapshot) return;

  const context = await refreshActiveContext().catch(() => null);
  const activeTabId = context?.tabId ?? null;

  const table = document.getElementById('infoTable');
  if (!table) return;

  const tabRecords = snapshot.youtubeWatchTabRecordsOfCurrentWindow || {};
  const currentOrderIds = snapshot.youtubeWatchTabRecordIdsInCurrentOrder || [];

  const hiddenTabsMayHaveStaleRemaining = Object.values(tabRecords).some(
    (record) => Boolean(record?.remainingTimeMayBeStale),
  );
  const readyTabsAreContiguous = areReadyTabsContiguous(tabRecords);
  const readyTabsAreAtFront = areReadyTabsAtFront(tabRecords);

  const totalWatchTabsInWindow = Object.keys(tabRecords).length;
  const watchTabsReadyCount = countTabsReadyForSorting(tabRecords);
  const knownWatchTabsOutOfOrder = areRecordsWithKnownDurationOutOfOrder(tabRecords);
  const backgroundSortedFlag = snapshot.tabsInCurrentWindowAreKnownToBeSorted === true;
  const allKnown = totalWatchTabsInWindow > 1 && watchTabsReadyCount === totalWatchTabsInWindow;
  const computedAllSorted = allRecordsHaveKnownRemainingTimeAndAreInOrder(tabRecords);
  const shouldShowSorted =
    computedAllSorted || (backgroundSortedFlag && allKnown && !knownWatchTabsOutOfOrder);

  updateSortingState({
    tabsInCurrentWindowAreKnownToBeSorted: shouldShowSorted,
    totalWatchTabsInWindow,
    watchTabsReadyCount,
    knownWatchTabsOutOfOrder,
    hiddenTabsMayHaveStaleRemaining,
    readyTabsAreContiguous,
    readyTabsAreAtFront,
  });

  setActionAndStatusColumnsVisibility(!shouldShowSorted);

  while (table.rows.length > 1) table.deleteRow(1);
  const frag = document.createDocumentFragment();
  for (const tabId of currentOrderIds) {
    const row = table.insertRow(-1);
    const tabRecord = tabRecords[tabId];
    if (!tabRecord) continue;
    tabRecord.isActiveTab = String(tabId) === String(activeTabId);
    tabRecord.remainingTimeMayBeStale = Boolean(tabRecord.remainingTimeMayBeStale);
    if (tabRecord.remainingTimeMayBeStale) row.classList.add('stale-remaining-row');
    insertRowCells(row, tabRecord, shouldShowSorted);
    frag.appendChild(row);
  }
  table.appendChild(frag);

  if (allKnown && !shouldShowSorted) {
    addClassToAllRows(table, 'all-ready-row');
  }

  updateHeaderFooter();
}
