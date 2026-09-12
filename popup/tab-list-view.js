import { getPopupDocument, getPopupElement } from './elements.js';
import { renderTabRow } from './tab-row-view.js';

export function renderTabList(records, { allVideosReadyAndOrdered = false, requestTabAction } = {}) {
  const table = getPopupElement('table');
  if (!table) return;
  const runtimeDocument = getPopupDocument();
  const tbody = table.tBodies[0] ?? table.createTBody();
  const rowFragment = runtimeDocument.createDocumentFragment();
  for (const record of records) {
    const row = runtimeDocument.createElement('tr');
    renderTabRow(row, record, allVideosReadyAndOrdered, requestTabAction);
    rowFragment.appendChild(row);
  }
  tbody.replaceChildren(rowFragment);
  table.classList.toggle('hide', records.length === 0);
}
