import { createSortSummary } from '../shared/sorting/summary.js';
import {
  addClassToTabRows,
  syncPopupLayout,
  setMetadataColumnsVisible,
} from './popup-layout-view.js';
import {
  getPopupDocument,
  getPopupElement,
  setErrorMessage,
  setStateMessage,
} from './popup-elements.js';
import { applyPopupState } from './popup-store.js';
import { renderTabRow } from './tab-row-view.js';

export function renderTabList(snapshot, { requestTabAction } = {}) {
  if (!snapshot) return;
  setErrorMessage('');

  const runtimeDocument = getPopupDocument();
  const table = getPopupElement('table');
  if (!table) return;
  const tbody = table.tBodies[0] ?? table.createTBody();

  const tabRecords = snapshot.tabRecordsById || {};
  const trackedTabOrder = snapshot.trackedTabOrder || [];
  const sortSummary = createSortSummary(snapshot.sortSummary);
  const isTargetOrderApplied = snapshot.isTargetOrderApplied === true;
  const hasTrackedTabs = trackedTabOrder.some((tabId) => Boolean(tabRecords[tabId]));

  applyPopupState({
    isTargetOrderApplied,
    sortSummary,
  });

  setMetadataColumnsVisible(!isTargetOrderApplied);

  const rowFragment = runtimeDocument.createDocumentFragment();
  for (const tabId of trackedTabOrder) {
    const row = runtimeDocument.createElement('tr');
    const tabRecord = tabRecords[tabId];
    if (!tabRecord) continue;
    const normalizedRecord = {
      ...tabRecord,
      remainingTimeStale: Boolean(tabRecord.remainingTimeStale),
    };
    if (normalizedRecord.remainingTimeStale) row.classList.add('stale-remaining-row');
    renderTabRow(row, normalizedRecord, isTargetOrderApplied, requestTabAction);
    rowFragment.appendChild(row);
  }
  tbody.replaceChildren(rowFragment);
  table.classList.toggle('hide', !hasTrackedTabs);
  setStateMessage(hasTrackedTabs ? '' : 'No YouTube video tabs in this window.');

  if (sortSummary.allSortableTabsReady && !isTargetOrderApplied) {
    addClassToTabRows(table, 'all-ready-row');
  }

  syncPopupLayout();
}
