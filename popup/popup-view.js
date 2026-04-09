import { createEmptySortSummary } from '../shared/sort-summary.js';

export const popupViewState = {
  sortSummary: createEmptySortSummary(),
  allSortableTabsSorted: false,
  activeWindowId: null,
};

export const popupViewModel = popupViewState;

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
  popupViewState.activeWindowId = typeof windowId === 'number' ? windowId : null;
}

export function updatePopupViewState(updates = {}) {
  Object.assign(popupViewState, updates);
}

export const updatePopupViewModel = updatePopupViewState;

export function initializePopupView() {
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

export const initializeView = initializePopupView;

function getCachedElement(key) {
  if (!domCache.initialized) initializePopupView();
  return domCache[key];
}

function updateStatus(statusElement) {
  if (!statusElement) return;
  const trackedTabCount = popupViewState.sortSummary.counts.tracked;
  const readyTabCount = popupViewState.sortSummary.counts.ready;
  if (!popupViewState.allSortableTabsSorted) {
    statusElement.style.display = trackedTabCount <= 1 ? 'none' : 'block';
    statusElement.textContent = `${readyTabCount}/${trackedTabCount} ready for sort.`;
    statusElement.style.color = 'var(--status-text-color)';
    return;
  }
  statusElement.style.display = 'none';
}

function updateSortedBadge(sortedBadgeElement) {
  if (!sortedBadgeElement) return;
  sortedBadgeElement.style.display = popupViewState.allSortableTabsSorted ? 'block' : 'none';
}

export function getEmptyStateMessage(trackedTabCount) {
  if (trackedTabCount <= 0) {
    return 'Open YouTube watch or shorts tabs in this window to sort them.';
  }
  if (trackedTabCount === 1) {
    return 'Open at least one more YouTube video tab in this window to sort them.';
  }
  return '';
}

function updateEmptyState(emptyStateElement) {
  if (!emptyStateElement) return;
  const message = getEmptyStateMessage(popupViewState.sortSummary.counts.tracked);
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

export function getSortButtonText(readyTabCount, trackedTabCount) {
  return readyTabCount === trackedTabCount ? 'Sort All Tabs' : 'Move Ready Tabs First';
}

function updateSortButton(sortButton, shouldShowSort) {
  if (!sortButton) return;
  if (shouldShowSort) {
    sortButton.style.setProperty('display', 'block', 'important');
    const { ready, tracked } = popupViewState.sortSummary.counts;
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

export function renderPopupView() {
  const emptyStateElement = getCachedElement('emptyStateElement');
  const statusElement = getCachedElement('statusElement');
  const sortButton = getCachedElement('sortButton');
  const sortedBadgeElement = getCachedElement('sortedBadgeElement');
  const table = getCachedElement('table');
  const { counts, readyTabs } = popupViewState.sortSummary;

  const readySubsetExists = counts.ready >= 2 && counts.ready < counts.tracked;
  const readySubsetNeedsSorting = readySubsetExists && (!readyTabs.contiguous || !readyTabs.atFront);
  const shouldShowSort =
    counts.ready >= 2 &&
    !popupViewState.allSortableTabsSorted &&
    (readyTabs.outOfOrder || readySubsetNeedsSorting);

  setOptionToggleVisibility(shouldShowSort);

  updateStatus(statusElement);
  updateSortedBadge(sortedBadgeElement);
  updateSortButton(sortButton, shouldShowSort);
  updateEmptyState(emptyStateElement);

  if (popupViewState.allSortableTabsSorted && table) {
    clearReadyRows(table);
  }
}

export const renderHeaderView = renderPopupView;

export function addClassToAllRows(table, className) {
  for (let i = 1; i < table.rows.length; i += 1) {
    table.rows[i].classList.add(className);
  }
}
