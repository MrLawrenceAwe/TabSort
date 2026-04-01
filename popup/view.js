import { popupState } from './state.js';

const domCache = {
  errorElement: null,
  emptyStateElement: null,
  statusElement: null,
  sortButton: null,
  tabsSortedElement: null,
  table: null,
  actionRequiredColumn: null,
  tabStatusColumn: null,
  initialized: false,
};

export function initializeView() {
  if (domCache.initialized) return;

  domCache.errorElement = document.getElementById('popupError');
  domCache.emptyStateElement = document.getElementById('emptyState');
  domCache.statusElement = document.getElementById('videoTabsReadyStatus');
  domCache.sortButton = document.getElementById('sortButton');
  domCache.tabsSortedElement = document.getElementById('tabsSorted');
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
  if (!popupState.tabsSorted) {
    statusElement.style.display = popupState.trackedTabCount <= 1 ? 'none' : 'block';
    statusElement.textContent = `${popupState.readyTabCount}/${popupState.trackedTabCount} ready for sort.`;
    statusElement.style.color = 'var(--status-text-color)';
    return;
  }
  statusElement.style.display = 'none';
}

function updateTabsSorted(tabsSortedElement) {
  if (!tabsSortedElement) return;
  tabsSortedElement.style.display = popupState.tabsSorted ? 'block' : 'none';
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
  const message = getEmptyStateMessage(popupState.trackedTabCount);
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

function updateSortButton(sortButton, shouldShowSort) {
  if (!sortButton) return;
  if (shouldShowSort) {
    sortButton.style.setProperty('display', 'block', 'important');
    const allTabsReady = popupState.readyTabCount === popupState.trackedTabCount;
    const readyBackground = 'var(--all-ready-row-background)';
    const readyText = 'var(--all-ready-row-text)';
    sortButton.style.backgroundColor = allTabsReady ? readyBackground : 'var(--action-button-background)';
    sortButton.style.color = allTabsReady ? readyText : 'var(--action-button-color)';
    sortButton.style.borderColor = allTabsReady ? readyBackground : 'var(--action-button-border-color)';
    sortButton.textContent = allTabsReady ? 'Sort All Tabs' : 'Sort Ready Tabs';
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

export function setOptionToggleVisibility(visible) {
  document.querySelectorAll('.option-toggle').forEach((toggle) => {
    if (toggle instanceof HTMLElement) {
      toggle.style.display = visible ? 'flex' : 'none';
    }
  });
}

export function renderHeaderState() {
  const emptyStateElement = getCachedElement('emptyStateElement');
  const statusElement = getCachedElement('statusElement');
  const sortButton = getCachedElement('sortButton');
  const tabsSortedElement = getCachedElement('tabsSortedElement');
  const table = getCachedElement('table');

  const readySubsetExists =
    popupState.readyTabCount >= 2 &&
    popupState.readyTabCount < popupState.trackedTabCount;
  const readySubsetNeedsSorting =
    readySubsetExists && (!popupState.areReadyTabsContiguous || !popupState.areReadyTabsAtFront);
  const shouldShowSort =
    popupState.readyTabCount >= 2 &&
    !popupState.tabsSorted &&
    (popupState.areReadyTabsOutOfOrder || readySubsetNeedsSorting);

  setOptionToggleVisibility(shouldShowSort);

  updateStatus(statusElement);
  updateTabsSorted(tabsSortedElement);
  updateSortButton(sortButton, shouldShowSort);
  updateEmptyState(emptyStateElement);

  if (popupState.tabsSorted && table) {
    clearReadyRows(table);
  }
}

export function addClassToAllRows(table, className) {
  for (let i = 1; i < table.rows.length; i += 1) {
    table.rows[i].classList.add(className);
  }
}
