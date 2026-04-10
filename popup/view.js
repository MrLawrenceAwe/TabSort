import { createEmptySortSummary } from '../shared/sort-summary.js';

export const viewState = {
  sortSummary: createEmptySortSummary(),
  allSortableTabsSorted: false,
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

export function setActiveWindowId(windowId) {
  viewState.activeWindowId = typeof windowId === 'number' ? windowId : null;
}

export function updateViewState(updates = {}) {
  Object.assign(viewState, updates);
}

export function initializeView() {
  if (domCache.initialized) return;

  domCache.errorElement = document.getElementById('popupError');
  domCache.emptyStateElement = document.getElementById('emptyState');
  domCache.statusElement = document.getElementById('videoTabsReadyStatus');
  domCache.sortButton = document.getElementById('sortButton');
  domCache.sortedBadgeElement = document.getElementById('tabsSorted');
  domCache.table = document.getElementById('infoTable');
  domCache.actionRequiredColumn = document.querySelector('.action-required');
  domCache.tabStatusColumn = document.querySelector('.tab-status');
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
  if (!viewState.allSortableTabsSorted) {
    statusElement.style.display = trackedTabCount <= 1 ? 'none' : 'block';
    statusElement.textContent = `${readyTabCount}/${trackedTabCount} ready for sort.`;
    statusElement.style.color = 'var(--status-text-color)';
    return;
  }
  statusElement.style.display = 'none';
}

function updateSortedBadge(sortedBadgeElement) {
  if (!sortedBadgeElement) return;
  sortedBadgeElement.style.display = viewState.allSortableTabsSorted ? 'block' : 'none';
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
  if (shouldShowSort) {
    sortButton.style.setProperty('display', 'block', 'important');
    const { ready, tracked } = viewState.sortSummary.counts;
    const allTabsReady = ready === tracked;
    const readyBackground = 'var(--all-ready-row-background)';
    const readyText = 'var(--all-ready-row-text)';
    sortButton.style.backgroundColor = allTabsReady
      ? readyBackground
      : 'var(--action-button-background)';
    sortButton.style.color = allTabsReady ? readyText : 'var(--action-button-color)';
    sortButton.style.borderColor = allTabsReady
      ? readyBackground
      : 'var(--action-button-border-color)';
    sortButton.textContent = getSortButtonText(ready, tracked);
    return;
  }
  sortButton.style.setProperty('display', 'none', 'important');
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
  document.querySelectorAll('.option-toggle').forEach((toggle) => {
    if (toggle instanceof HTMLElement) {
      toggle.style.display = visible ? 'flex' : 'none';
    }
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
    !viewState.allSortableTabsSorted &&
    (readyTabs.outOfOrder || readySubsetNeedsSorting);

  setOptionToggleVisibility(shouldShowSort);

  updateStatus(statusElement);
  updateSortedBadge(sortedBadgeElement);
  updateSortButton(sortButton, shouldShowSort);
  updateEmptyState(emptyStateElement);

  if (viewState.allSortableTabsSorted && table) {
    clearReadyRows(table);
  }
}

export function addClassToDataRows(table, className) {
  for (let i = 1; i < table.rows.length; i += 1) {
    table.rows[i].classList.add(className);
  }
}
