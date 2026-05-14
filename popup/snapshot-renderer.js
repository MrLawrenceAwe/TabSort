import { cloneSortSummary } from '../shared/sort-summary.js';
import {
  addClassToTabRows,
  syncPopupLayout,
  setMetadataColumnsVisible,
} from './popup-layout-view.js';
import { setErrorMessage } from './popup-elements.js';
import { applyPopupState } from './popup-store.js';
import { renderTabRow } from './tab-row-view.js';

export function renderSnapshot(snapshot, { postRuntimeMessage } = {}) {
  if (!snapshot) return;
  setErrorMessage('');

  const table = document.getElementById('infoTable');
  if (!table) return;
  const tbody = table.tBodies[0] ?? table.createTBody();

  const tabRecords = snapshot.tabRecordsById || {};
  const visibleTabIds = snapshot.visibleTabIds || [];
  const sortSummary = cloneSortSummary(snapshot.sortSummary);
  const currentOrderMatchesTarget = snapshot.currentOrderMatchesTarget === true;

  applyPopupState({
    currentOrderMatchesTarget,
    sortSummary,
  });

  setMetadataColumnsVisible(!currentOrderMatchesTarget);

  const rowFragment = document.createDocumentFragment();
  for (const tabId of visibleTabIds) {
    const row = document.createElement('tr');
    const tabRecord = tabRecords[tabId];
    if (!tabRecord) continue;
    const normalizedRecord = {
      ...tabRecord,
      remainingTimeNeedsRefresh: Boolean(tabRecord.remainingTimeNeedsRefresh),
    };
    if (normalizedRecord.remainingTimeNeedsRefresh) row.classList.add('stale-remaining-row');
    renderTabRow(row, normalizedRecord, currentOrderMatchesTarget, postRuntimeMessage);
    rowFragment.appendChild(row);
  }
  tbody.replaceChildren(rowFragment);

  if (sortSummary.order.allSortableTabsReady && !currentOrderMatchesTarget) {
    addClassToTabRows(table, 'all-sort-ready-row');
  }

  syncPopupLayout();
}
