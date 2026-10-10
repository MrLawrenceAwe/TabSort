import { getPopupDocument, getPopupElement } from './elements.js';
import { renderTabRow } from './tab-row-view.js';

export function renderTabList(records, { isYouTubeLayoutOrganised = false, requestAction } = {}) {
  const table = getPopupElement('tabsTable');
  if (!table) return;
  const runtimeDocument = getPopupDocument();
  const tbody = table.tBodies[0] ?? table.createTBody();
  const focusedButton = runtimeDocument.activeElement;
  const focusedTabId = focusedButton?.matches('.tab-action-button') && tbody.contains(focusedButton)
    ? focusedButton.closest('tr').getAttribute('data-tab-id')
    : null;
  const focusedActionType = focusedTabId == null ? null : focusedButton.getAttribute('data-action-type');
  let replacementButton = null;
  const rowFragment = runtimeDocument.createDocumentFragment();
  for (const record of records) {
    const row = runtimeDocument.createElement('tr');
    row.setAttribute('data-tab-id', String(record.id));
    renderTabRow(row, record, isYouTubeLayoutOrganised, requestAction);
    if (String(record.id) === focusedTabId) {
      replacementButton = row.querySelector('.tab-action-button');
    }
    rowFragment.appendChild(row);
  }
  tbody.replaceChildren(rowFragment);
  table.classList.toggle('hide', records.length === 0);
  if (replacementButton && !replacementButton.disabled &&
      replacementButton.getAttribute('data-action-type') === focusedActionType) {
    replacementButton.focus({ preventScroll: true });
  }
}
