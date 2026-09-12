import { createSortSummary } from '../shared/sorting/summary.js';
import {
  syncPopupLayout,
  setNextStepHeaderVisible,
} from './layout-view.js';
import {
  getPopupDocument,
  getPopupElement,
  setErrorMessage,
  setStateMessage,
  setBacklogSummary,
} from './elements.js';
import { createBacklogSummary, formatBacklogSummary } from './backlog-summary.js';
import { applyPopupState } from './store.js';
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
  const trackedRecords = trackedTabOrder
    .map((tabId) => tabRecords[tabId])
    .filter(Boolean);

  applyPopupState({
    isTargetOrderApplied,
    sortSummary,
    autoPreparation: snapshot.autoPreparation ?? { status: 'idle' },
  });

  setNextStepHeaderVisible(!isTargetOrderApplied);

  const rowFragment = runtimeDocument.createDocumentFragment();
  for (const tabId of trackedTabOrder) {
    const row = runtimeDocument.createElement('tr');
    const tabRecord = tabRecords[tabId];
    if (!tabRecord) continue;
    renderTabRow(row, tabRecord, isTargetOrderApplied, requestTabAction);
    rowFragment.appendChild(row);
  }
  tbody.replaceChildren(rowFragment);
  table.classList.toggle('hide', !hasTrackedTabs);
  setStateMessage(hasTrackedTabs ? '' : 'No YouTube video tabs in this window.');
  setBacklogSummary(formatBacklogSummary(createBacklogSummary(trackedRecords)));

  syncPopupLayout();
}
