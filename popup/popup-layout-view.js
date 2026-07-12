import { getPopupDocument, getPopupElement } from './popup-elements.js';
import { popupState } from './popup-store.js';

function updateStatus(status) {
  if (!status) return;
  const trackedTabCount = popupState.sortSummary.counts.tracked;
  const sortReadyTabCount = popupState.sortSummary.counts.sortReady;
  if (!popupState.isSortComplete) {
    status.classList.toggle('hide', trackedTabCount <= 1);
    status.textContent = `${sortReadyTabCount} of ${trackedTabCount} tabs ready.`;
    return;
  }
  status.classList.add('hide');
}

function updateSortedBadge(sortedBadge) {
  if (!sortedBadge) return;
  sortedBadge.classList.toggle('hide', !popupState.isSortComplete);
}

export function getSortButtonText(sortReadyTabCount, totalTabCount) {
  return sortReadyTabCount === totalTabCount ? 'Sort Tabs' : 'Organise Ready Tabs';
}

function updateSortButton(sortButton, shouldShowSort) {
  if (!sortButton) return;
  sortButton.classList.toggle('hide', !shouldShowSort);
  if (shouldShowSort) {
    const { sortReady, tracked } = popupState.sortSummary.counts;
    sortButton.classList.toggle('all-tabs-ready', sortReady === tracked);
    sortButton.textContent = getSortButtonText(sortReady, tracked);
    return;
  }
  sortButton.classList.remove('all-tabs-ready');
}

function clearReadyRows(table) {
  for (let i = 1; i < table.rows.length; i += 1) {
    table.rows[i].classList.remove('sort-ready-row');
  }
}

export function setMetadataColumnsVisible(visible) {
  const nextStep = getPopupElement('nextStepColumn');
  const loadState = getPopupElement('loadStateColumn');
  nextStep?.classList.toggle('hide', !visible);
  loadState?.classList.toggle('hide', !visible);
}

function setOptionToggleVisibility(visible) {
  const runtimeDocument = getPopupDocument();
  if (!runtimeDocument?.querySelectorAll) return;
  runtimeDocument.querySelectorAll('.option-toggle').forEach((toggle) => {
    toggle.classList?.toggle('hide', !visible);
  });
}

export function syncPopupLayout() {
  const status = getPopupElement('status');
  const sortButton = getPopupElement('sortButton');
  const sortedBadge = getPopupElement('sortedBadge');
  const table = getPopupElement('table');
  const { counts, sortReadyTabs } = popupState.sortSummary;

  const sortReadySubsetExists = counts.sortReady >= 2 && counts.sortReady < counts.tracked;
  const sortReadySubsetNeedsSorting =
    sortReadySubsetExists && (!sortReadyTabs.contiguous || !sortReadyTabs.atFront);
  const shouldShowSort =
    counts.sortReady >= 2 &&
    !popupState.isSortComplete &&
    (sortReadyTabs.outOfOrder || sortReadySubsetNeedsSorting);

  setOptionToggleVisibility(shouldShowSort);

  updateStatus(status);
  updateSortedBadge(sortedBadge);
  updateSortButton(sortButton, shouldShowSort);

  if (popupState.isSortComplete && table) {
    clearReadyRows(table);
  }
}

export function addClassToTabRows(table, className) {
  for (let i = 1; i < table.rows.length; i += 1) {
    table.rows[i].classList.add(className);
  }
}
