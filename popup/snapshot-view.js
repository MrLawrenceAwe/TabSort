import { cloneSortSummary } from '../shared/sort-summary.js';
import {
  addClassToDataRows,
  renderView,
  setErrorMessage,
  setSecondaryColumnsVisible,
  updateViewState,
} from './view.js';
import { renderTabRow } from './tab-row-view.js';

export function renderSnapshot(snapshot, { postRuntimeMessage } = {}) {
  if (!snapshot) return;
  setErrorMessage('');

  const table = document.getElementById('infoTable');
  if (!table) return;
  const tbody = table.tBodies[0] ?? table.createTBody();

  const tabRecords = snapshot.tabRecordsById || {};
  const visibleOrder = snapshot.visibleOrder || [];
  const sortSummary = cloneSortSummary(snapshot.sortSummary);
  const backgroundSortedFlag = snapshot.allSortableTabsSorted === true;
  const shouldUseSortedView =
    sortSummary.order.allSorted ||
    (backgroundSortedFlag &&
      sortSummary.order.allRemainingTimesKnown &&
      !sortSummary.readyTabs.outOfOrder);

  updateViewState({
    allSortableTabsSorted: shouldUseSortedView,
    sortSummary,
  });

  setSecondaryColumnsVisible(!shouldUseSortedView);

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
    renderTabRow(row, normalizedRecord, shouldUseSortedView, postRuntimeMessage);
    rowFragment.appendChild(row);
  }
  tbody.replaceChildren(rowFragment);

  if (sortSummary.order.allRemainingTimesKnown && !shouldUseSortedView) {
    addClassToDataRows(table, 'all-ready-row');
  }

  renderView();
}
