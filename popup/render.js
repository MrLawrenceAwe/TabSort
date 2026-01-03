import { updateSortingState } from './state.js';
import { logAndSend, refreshActiveContext, sendMessageWithWindowAsync } from './runtime.js';
import {
  setActionAndStatusColumnsVisibility,
  updateHeaderFooter,
  addClassToAllRows,
} from './dom-utils.js';
import { insertRowCells } from './rows.js';
import { EMPTY_READINESS_METRICS } from '../shared/readiness.js';
import { MESSAGE_TYPES } from '../shared/constants.js';
import { toErrorMessage } from '../shared/utils.js';

const SNAPSHOT_RETRY_DELAY_MS = 150;
const SNAPSHOT_MAX_ATTEMPTS = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isValidSnapshot = (snapshot) =>
  snapshot && typeof snapshot === 'object' && 'youtubeWatchTabRecordsOfCurrentWindow' in snapshot;

async function requestSnapshotWithRetry() {
  let lastError = null;

  for (let attempt = 1; attempt <= SNAPSHOT_MAX_ATTEMPTS; attempt += 1) {
    try {
      if (attempt > 1) {
        await refreshActiveContext().catch(() => {});
        await sendMessageWithWindowAsync('ping').catch(() => {});
        await sleep(SNAPSHOT_RETRY_DELAY_MS);
      }
      const response = await sendMessageWithWindowAsync('sendTabRecords', {});
      if (isValidSnapshot(response)) {
        return response;
      }
      lastError = new Error('Invalid snapshot response');
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    logAndSend(MESSAGE_TYPES.ERROR, `Failed to load tab records: ${toErrorMessage(lastError)}`);
  }
  return null;
}

export async function requestAndRenderSnapshot() {
  const snapshot = await requestSnapshotWithRetry();
  if (!snapshot) return;
  await renderSnapshot(snapshot);
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
