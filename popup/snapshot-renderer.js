import { cloneSortSummary } from '../shared/sort-summary-model.js';
import {
  addClassToDataRows,
  renderPopupChrome,
  setErrorMessage,
  setSecondaryColumnsVisible,
  applyPopupUiState,
} from './view.js';
import { renderTabRow } from './tab-row-view.js';

export function deriveSnapshotUiState(snapshot) {
  const sortSummary = cloneSortSummary(snapshot?.sortSummary);
  const snapshotSaysOrderMatchesTarget = snapshot?.currentOrderMatchesTarget === true;
  const currentOrderMatchesTarget =
    sortSummary.order.currentOrderMatchesTarget ||
    (snapshotSaysOrderMatchesTarget &&
      sortSummary.order.allSortableTabsReady &&
      !sortSummary.sortReadyTabs.outOfOrder);

  return {
    sortSummary,
    currentOrderMatchesTarget,
  };
}

export function renderSnapshot(snapshot, { postRuntimeMessage } = {}) {
  if (!snapshot) return;
  setErrorMessage('');

  const table = document.getElementById('infoTable');
  if (!table) return;
  const tbody = table.tBodies[0] ?? table.createTBody();

  const tabRecords = snapshot.tabRecordsById || {};
  const visibleTabIds = snapshot.visibleTabIds || [];
  const { sortSummary, currentOrderMatchesTarget } = deriveSnapshotUiState(snapshot);

  applyPopupUiState({
    currentOrderMatchesTarget,
    sortSummary,
  });

  setSecondaryColumnsVisible(!currentOrderMatchesTarget);

  const rowFragment = document.createDocumentFragment();
  for (const tabId of visibleTabIds) {
    const row = document.createElement('tr');
    const tabRecord = tabRecords[tabId];
    if (!tabRecord) continue;
    const normalizedRecord = {
      ...tabRecord,
      isRemainingTimeStale: Boolean(tabRecord.isRemainingTimeStale),
    };
    if (normalizedRecord.isRemainingTimeStale) row.classList.add('stale-remaining-row');
    renderTabRow(row, normalizedRecord, currentOrderMatchesTarget, postRuntimeMessage);
    rowFragment.appendChild(row);
  }
  tbody.replaceChildren(rowFragment);

  if (sortSummary.order.allSortableTabsReady && !currentOrderMatchesTarget) {
    addClassToDataRows(table, 'all-sort-ready-row');
  }

  renderPopupChrome();
}
