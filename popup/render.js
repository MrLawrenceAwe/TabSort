import { updateSortingState } from './state.js';
import { sendMessageWithWindowAsync } from './runtime.js';
import {
  setActionAndStatusColumnsVisibility,
  updateHeaderFooter,
  addClassToAllRows,
} from './dom-utils.js';
import { insertRowCells } from './rows.js';
import { EMPTY_READINESS_METRICS } from '../shared/readiness.js';

export async function requestAndRenderSnapshot() {
  const response = await sendMessageWithWindowAsync('sendTabRecords', {});
  if (!response) return;
  await renderSnapshot(response);
}

export async function renderSnapshot(snapshot) {
  if (!snapshot) return;

  const table = document.getElementById('infoTable');
  if (!table) return;
  const tbody = table.tBodies[0] ?? table.createTBody();

  const tabRecords = snapshot.youtubeWatchTabRecordsOfCurrentWindow || {};
  const currentOrderIds = snapshot.youtubeWatchTabRecordIdsInCurrentOrder || [];

  const metrics = { ...EMPTY_READINESS_METRICS, ...(snapshot.readinessMetrics || {}) };
  const backgroundSortedFlag = snapshot.tabsInCurrentWindowAreKnownToBeSorted === true;
  const shouldShowSorted =
    metrics.computedAllSorted ||
    (backgroundSortedFlag && metrics.allKnown && !metrics.knownWatchTabsOutOfOrder);

  updateSortingState({
    tabsInCurrentWindowAreKnownToBeSorted: shouldShowSorted,
    totalWatchTabsInWindow: metrics.totalWatchTabsInWindow,
    watchTabsReadyCount: metrics.watchTabsReadyCount,
    knownWatchTabsOutOfOrder: metrics.knownWatchTabsOutOfOrder,
    hiddenTabsMayHaveStaleRemaining: metrics.hiddenTabsMayHaveStaleRemaining,
    readyTabsAreContiguous: metrics.readyTabsAreContiguous,
    readyTabsAreAtFront: metrics.readyTabsAreAtFront,
  });

  setActionAndStatusColumnsVisibility(!shouldShowSorted);

  const frag = document.createDocumentFragment();
  for (const tabId of currentOrderIds) {
    const row = document.createElement('tr');
    const tabRecord = tabRecords[tabId];
    if (!tabRecord) continue;
    tabRecord.remainingTimeMayBeStale = Boolean(tabRecord.remainingTimeMayBeStale);
    if (tabRecord.remainingTimeMayBeStale) row.classList.add('stale-remaining-row');
    insertRowCells(row, tabRecord, shouldShowSorted);
    frag.appendChild(row);
  }
  tbody.replaceChildren(frag);

  if (metrics.allKnown && !shouldShowSorted) {
    addClassToAllRows(table, 'all-ready-row');
  }

  updateHeaderFooter();
}
