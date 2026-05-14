import { getPopupDocument, getPopupElement } from './popup-elements.js';
import { popupState } from './popup-store.js';

function updateStatus(statusElement) {
  if (!statusElement) return;
  const trackedTabCount = popupState.sortSummary.counts.tracked;
  const sortReadyTabCount = popupState.sortSummary.counts.sortReady;
  if (!popupState.eligibleVideosAlreadySorted) {
    statusElement.classList.toggle('hide', trackedTabCount <= 1);
    statusElement.textContent = `${sortReadyTabCount}/${trackedTabCount} ready for sort.`;
    return;
  }
  statusElement.classList.add('hide');
}

function updateSortedBadge(sortedBadgeElement) {
  if (!sortedBadgeElement) return;
  sortedBadgeElement.classList.toggle('hide', !popupState.eligibleVideosAlreadySorted);
}

export function getSortButtonText(sortReadyTabCount, totalTabCount) {
  return sortReadyTabCount === totalTabCount ? 'Sort All Tabs' : 'Move Ready Tabs';
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
  const actionRequired = getPopupElement('actionRequiredColumn');
  const tabStatus = getPopupElement('tabStatusColumn');
  const method = visible ? 'remove' : 'add';
  actionRequired?.classList[method]('hide');
  tabStatus?.classList[method]('hide');
}

function setOptionToggleVisibility(visible) {
  const runtimeDocument = getPopupDocument();
  if (!runtimeDocument?.querySelectorAll) return;
  runtimeDocument.querySelectorAll('.option-toggle').forEach((toggle) => {
    toggle.classList?.toggle('hide', !visible);
  });
}

export function syncPopupLayout() {
  const statusElement = getPopupElement('statusElement');
  const sortButton = getPopupElement('sortButton');
  const sortedBadgeElement = getPopupElement('sortedBadgeElement');
  const table = getPopupElement('table');
  const { counts, sortReadyTabs } = popupState.sortSummary;

  const sortReadySubsetExists = counts.sortReady >= 2 && counts.sortReady < counts.tracked;
  const sortReadySubsetNeedsSorting =
    sortReadySubsetExists && (!sortReadyTabs.contiguous || !sortReadyTabs.atFront);
  const shouldShowSort =
    counts.sortReady >= 2 &&
    !popupState.eligibleVideosAlreadySorted &&
    (sortReadyTabs.outOfOrder || sortReadySubsetNeedsSorting);

  setOptionToggleVisibility(shouldShowSort);

  updateStatus(statusElement);
  updateSortedBadge(sortedBadgeElement);
  updateSortButton(sortButton, shouldShowSort);

  if (popupState.eligibleVideosAlreadySorted && table) {
    clearReadyRows(table);
  }
}

export function addClassToTabRows(table, className) {
  for (let i = 1; i < table.rows.length; i += 1) {
    table.rows[i].classList.add(className);
  }
}
