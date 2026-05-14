import { cloneSortSummary } from '../shared/sort-summary.js';
import {
  addClassToTabRows,
  syncPopupLayout,
  setMetadataColumnsVisible,
} from './popup-layout-view.js';
import { setErrorMessage } from './popup-elements.js';
import { applyPopupState } from './popup-store.js';
import { renderTabRow } from './tab-row-view.js';

export function renderTabList(snapshot, { postRuntimeMessage } = {}) {
  if (!snapshot) return;
  setErrorMessage('');

  const table = document.getElementById('infoTable');
  if (!table) return;
  const tbody = table.tBodies[0] ?? table.createTBody();

  const tabRecords = snapshot.tabRecordsById || {};
  const trackedTabIdsInWindowOrder = snapshot.trackedTabIdsInWindowOrder || [];
  const sortSummary = cloneSortSummary(snapshot.sortSummary);
  const eligibleVideosAlreadySorted = snapshot.eligibleVideosAlreadySorted === true;

  applyPopupState({
    eligibleVideosAlreadySorted,
    sortSummary,
  });

  setMetadataColumnsVisible(!eligibleVideosAlreadySorted);

  const rowFragment = document.createDocumentFragment();
  for (const tabId of trackedTabIdsInWindowOrder) {
    const row = document.createElement('tr');
    const tabRecord = tabRecords[tabId];
    if (!tabRecord) continue;
    const normalizedRecord = {
      ...tabRecord,
      remainingTimeStale: Boolean(tabRecord.remainingTimeStale),
    };
    if (normalizedRecord.remainingTimeStale) row.classList.add('stale-remaining-row');
    renderTabRow(row, normalizedRecord, eligibleVideosAlreadySorted, postRuntimeMessage);
    rowFragment.appendChild(row);
  }
  tbody.replaceChildren(rowFragment);

  if (sortSummary.order.allEligibleVideosReady && !eligibleVideosAlreadySorted) {
    addClassToTabRows(table, 'all-sort-ready-row');
  }

  syncPopupLayout();
}
