import { cloneSortSummary } from '../shared/sort-summary-model.js';
import {
  addClassToDataRows,
  renderView,
  setErrorMessage,
  setSecondaryColumnsVisible,
  updateViewState,
} from './view.js';
import { renderTabRow } from './tab-row-view.js';

export function derivePopupSnapshotViewState(snapshot) {
  const sortSummary = cloneSortSummary(snapshot?.sortSummary);
  const snapshotSaysSorted = snapshot?.sortableVideosSortedByRemainingTime === true;
  const sortableVideosSortedByRemainingTime =
    sortSummary.order.sortableVideosSortedByRemainingTime ||
    (snapshotSaysSorted &&
      sortSummary.order.allSortableVideosSortReady &&
      !sortSummary.sortReadyTabs.outOfOrder);

  return {
    sortSummary,
    sortableVideosSortedByRemainingTime,
  };
}

export function renderSnapshot(snapshot, { postRuntimeMessage } = {}) {
  if (!snapshot) return;
  setErrorMessage('');

  const table = document.getElementById('infoTable');
  if (!table) return;
  const tbody = table.tBodies[0] ?? table.createTBody();

  const tabRecords = snapshot.tabRecordsById || {};
  const visibleOrder = snapshot.visibleOrder || [];
  const { sortSummary, sortableVideosSortedByRemainingTime } = derivePopupSnapshotViewState(snapshot);

  updateViewState({
    sortableVideosSortedByRemainingTime,
    sortSummary,
  });

  setSecondaryColumnsVisible(!sortableVideosSortedByRemainingTime);

  const rowFragment = document.createDocumentFragment();
  for (const tabId of visibleOrder) {
    const row = document.createElement('tr');
    const tabRecord = tabRecords[tabId];
    if (!tabRecord) continue;
    const normalizedRecord = {
      ...tabRecord,
      isRemainingTimeStale: Boolean(tabRecord.isRemainingTimeStale),
    };
    if (normalizedRecord.isRemainingTimeStale) row.classList.add('stale-remaining-row');
    renderTabRow(row, normalizedRecord, sortableVideosSortedByRemainingTime, postRuntimeMessage);
    rowFragment.appendChild(row);
  }
  tbody.replaceChildren(rowFragment);

  if (sortSummary.order.allSortableVideosSortReady && !sortableVideosSortedByRemainingTime) {
    addClassToDataRows(table, 'all-sort-ready-row');
  }

  renderView();
}
