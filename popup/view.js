import { createEmptySortSummary } from '../shared/sort-summary.js';

export const viewState = {
  sortSummary: createEmptySortSummary(),
  allSortableVodTabsSorted: false,
  activeWindowId: null,
};

const domCache = {
  errorElement: null,
  emptyStateElement: null,
  statusElement: null,
  sortButton: null,
  sortedBadgeElement: null,
  table: null,
  actionRequiredColumn: null,
  tabStatusColumn: null,
  initialized: false,
};

function getRootDocument(rootDocument) {
  return rootDocument ?? globalThis.document;
}

export function resetView() {
  domCache.errorElement = null;
  domCache.emptyStateElement = null;
  domCache.statusElement = null;
  domCache.sortButton = null;
  domCache.sortedBadgeElement = null;
  domCache.table = null;
  domCache.actionRequiredColumn = null;
  domCache.tabStatusColumn = null;
  domCache.initialized = false;
  viewState.sortSummary = createEmptySortSummary();
  viewState.allSortableVodTabsSorted = false;
  viewState.activeWindowId = null;
}

export function setActiveWindowId(windowId) {
  viewState.activeWindowId = typeof windowId === 'number' ? windowId : null;
}

export function updateViewState(updates = {}) {
  Object.assign(viewState, updates);
}

export function initializeView(rootDocument = globalThis.document) {
  if (domCache.initialized) return;
  const runtimeDocument = getRootDocument(rootDocument);
  if (!runtimeDocument) return;

  domCache.errorElement = runtimeDocument.getElementById('popupError');
  domCache.emptyStateElement = runtimeDocument.getElementById('emptyState');
  domCache.statusElement = runtimeDocument.getElementById('videoTabsReadyStatus');
  domCache.sortButton = runtimeDocument.getElementById('sortButton');
  domCache.sortedBadgeElement = runtimeDocument.getElementById('tabsSorted');
  domCache.table = runtimeDocument.getElementById('infoTable');
  domCache.actionRequiredColumn = runtimeDocument.querySelector('.action-required');
  domCache.tabStatusColumn = runtimeDocument.querySelector('.tab-status');
  domCache.initialized = true;
}

function getCachedElement(key) {
  if (!domCache.initialized) initializeView();
  return domCache[key];
}

function updateStatus(statusElement) {
  if (!statusElement) return;
  const trackedTabCount = viewState.sortSummary.counts.tracked;
  const readyTabCount = viewState.sortSummary.counts.ready;
  if (!viewState.allSortableVodTabsSorted) {
    statusElement.classList.toggle('hide', trackedTabCount <= 1);
    statusElement.textContent = `${readyTabCount}/${trackedTabCount} ready for sort.`;
    return;
  }
  statusElement.classList.add('hide');
}

function updateSortedBadge(sortedBadgeElement) {
  if (!sortedBadgeElement) return;
  sortedBadgeElement.classList.toggle('hide', !viewState.allSortableVodTabsSorted);
}

export function getEmptyStateMessage(tabCount) {
  if (tabCount <= 0) {
    return 'Open YouTube watch or shorts tabs in this window to sort them.';
  }
  if (tabCount === 1) {
    return 'Open at least one more YouTube video tab in this window to sort them.';
  }
  return '';
}

function updateEmptyState(emptyStateElement) {
  if (!emptyStateElement) return;
  const message = getEmptyStateMessage(viewState.sortSummary.counts.tracked);
  emptyStateElement.textContent = message;
  emptyStateElement.classList.toggle('hide', !message);
}

export function setErrorMessage(message = '') {
  const errorElement = getCachedElement('errorElement');
  if (!errorElement) return;
  const nextMessage = typeof message === 'string' ? message.trim() : '';
  errorElement.textContent = nextMessage;
  errorElement.classList.toggle('hide', !nextMessage);
}

export function getSortButtonText(readyTabCount, totalTabCount) {
  return readyTabCount === totalTabCount ? 'Sort All Tabs' : 'Move Ready Tabs First';
}

function updateSortButton(sortButton, shouldShowSort) {
  if (!sortButton) return;
  sortButton.classList.toggle('hide', !shouldShowSort);
  if (shouldShowSort) {
    const { ready, tracked } = viewState.sortSummary.counts;
    sortButton.classList.toggle('all-tabs-ready', ready === tracked);
    sortButton.textContent = getSortButtonText(ready, tracked);
    return;
  }
  sortButton.classList.remove('all-tabs-ready');
}

function clearReadyRows(table) {
  for (let i = 1; i < table.rows.length; i += 1) {
    table.rows[i].classList.remove('ready-row');
  }
}

export function setSecondaryColumnsVisible(visible) {
  const actionRequired = getCachedElement('actionRequiredColumn');
  const tabStatus = getCachedElement('tabStatusColumn');
  const method = visible ? 'remove' : 'add';
  actionRequired?.classList[method]('hide');
  tabStatus?.classList[method]('hide');
}

function setOptionToggleVisibility(visible) {
  const runtimeDocument = getRootDocument();
  if (!runtimeDocument?.querySelectorAll) return;
  runtimeDocument.querySelectorAll('.option-toggle').forEach((toggle) => {
    toggle.classList?.toggle('hide', !visible);
  });
}

export function renderView() {
  const emptyStateElement = getCachedElement('emptyStateElement');
  const statusElement = getCachedElement('statusElement');
  const sortButton = getCachedElement('sortButton');
  const sortedBadgeElement = getCachedElement('sortedBadgeElement');
  const table = getCachedElement('table');
  const { counts, readyTabs } = viewState.sortSummary;

  const readySubsetExists = counts.ready >= 2 && counts.ready < counts.tracked;
  const readySubsetNeedsSorting = readySubsetExists && (!readyTabs.contiguous || !readyTabs.atFront);
  const shouldShowSort =
    counts.ready >= 2 &&
    !viewState.allSortableVodTabsSorted &&
    (readyTabs.outOfOrder || readySubsetNeedsSorting);

  setOptionToggleVisibility(shouldShowSort);

  updateStatus(statusElement);
  updateSortedBadge(sortedBadgeElement);
  updateSortButton(sortButton, shouldShowSort);
  updateEmptyState(emptyStateElement);

  if (viewState.allSortableVodTabsSorted && table) {
    clearReadyRows(table);
  }
}

export function addClassToDataRows(table, className) {
  for (let i = 1; i < table.rows.length; i += 1) {
    table.rows[i].classList.add(className);
  }
}
