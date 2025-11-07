import { updateSortingState } from './state.js';
import { sendMessageWithWindow } from './runtime.js';
import {
  setActionAndStatusColumnsVisibility,
  updateHeaderFooter,
  addClassToAllRows,
} from './dom-utils.js';
import { insertRowCells } from './rows.js';
import {
  hasFreshRemainingTime,
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

  const table = document.getElementById('infoTable');
  if (!table) return;
  const tbody = table.tBodies[0] ?? table.createTBody();

  const tabRecords = snapshot.youtubeWatchTabRecordsOfCurrentWindow || {};
  const currentOrderIds = snapshot.youtubeWatchTabRecordIdsInCurrentOrder || [];

  const metrics = buildRenderMetrics(tabRecords, currentOrderIds);
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

function buildRenderMetrics(tabRecords, currentOrderIds) {
  const totalWatchTabsInWindow = Object.keys(tabRecords).length;
  let hiddenTabsMayHaveStaleRemaining = false;
  let watchTabsReadyCount = 0;
  let readyTabsAreContiguous = true;
  let readyTabsAreAtFront = true;
  let knownWatchTabsOutOfOrder = false;
  let allKnown = false;
  let computedAllSorted = false;

  const readyIdsInCurrentOrder = [];
  const readyEntries = [];
  const orderedIdsWithRecords = [];

  let encounteredReady = false;
  let encounteredNonReadyBeforeReady = false;
  let gapAfterReady = false;

  for (const tabId of currentOrderIds) {
    const record = tabRecords[tabId];
    if (!record) continue;
    orderedIdsWithRecords.push(tabId);
    if (record.remainingTimeMayBeStale) hiddenTabsMayHaveStaleRemaining = true;

    const isReady = hasFreshRemainingTime(record);
    if (isReady) {
      watchTabsReadyCount += 1;
      readyIdsInCurrentOrder.push(record.id);
      readyEntries.push({ id: record.id, remaining: record.videoDetails?.remainingTime || 0 });
      encounteredReady = true;
      if (gapAfterReady) readyTabsAreContiguous = false;
      continue;
    }

    if (!encounteredReady) {
      encounteredNonReadyBeforeReady = true;
    } else {
      gapAfterReady = true;
    }
  }

  if (encounteredReady && encounteredNonReadyBeforeReady) {
    readyTabsAreAtFront = false;
  }

  const readyIdsByRemaining = readyEntries
    .slice()
    .sort((a, b) => a.remaining - b.remaining)
    .map((entry) => entry.id);

  if (readyIdsInCurrentOrder.length >= 2) {
    knownWatchTabsOutOfOrder = !areIdListsEqual(readyIdsInCurrentOrder, readyIdsByRemaining);
  }

  allKnown = totalWatchTabsInWindow > 1 && watchTabsReadyCount === totalWatchTabsInWindow;

  if (allKnown) {
    computedAllSorted = areIdListsEqual(orderedIdsWithRecords, readyIdsByRemaining);
  }

  return {
    totalWatchTabsInWindow,
    watchTabsReadyCount,
    hiddenTabsMayHaveStaleRemaining,
    readyTabsAreContiguous,
    readyTabsAreAtFront,
    knownWatchTabsOutOfOrder,
    allKnown,
    computedAllSorted,
  };
}

function areIdListsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]) !== String(b[i])) return false;
  }
  return true;
}
