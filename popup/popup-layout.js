import { popupState } from './state.js';

const domCache = {
  statusElement: null,
  sortButton: null,
  tabsSortedElement: null,
  table: null,
  hiddenWarningElement: null,
  actionRequiredColumn: null,
  tabStatusColumn: null,
  initialized: false,
};

export function initializeDomCache() {
  if (domCache.initialized) return;

  domCache.statusElement = document.getElementById('videoTabsReadyStatus');
  domCache.sortButton = document.getElementById('sortButton');
  domCache.tabsSortedElement = document.getElementById('tabsSorted');
  domCache.table = document.getElementById('infoTable');
  domCache.hiddenWarningElement = document.getElementById('hiddenTabWarning');
  domCache.actionRequiredColumn = document.querySelector('.action-required');
  domCache.tabStatusColumn = document.querySelector('.tab-status');
  domCache.initialized = true;
}

function getCachedElement(key) {
  if (!domCache.initialized) initializeDomCache();
  return domCache[key];
}

function updateStatus(statusElement) {
  if (!statusElement) return;
  if (!popupState.areTrackedTabsSorted) {
    statusElement.style.display = popupState.trackedTabCount <= 1 ? 'none' : 'block';
    statusElement.textContent = `${popupState.readyTabCount}/${popupState.trackedTabCount} ready for sort.`;
    statusElement.style.color = 'var(--status-text-color)';
    return;
  }
  statusElement.style.display = 'none';
}

function updateTabsSorted(tabsSortedElement) {
  if (!tabsSortedElement) return;
  tabsSortedElement.style.display = popupState.areTrackedTabsSorted ? 'block' : 'none';
}

export function getHiddenWarningMessage() {
  if (!popupState.hasBackgroundTabsWithStaleRemaining) return '';
  return 'Some background tabs may have stale remaining time. Open each tab once to refresh.';
}

function updateHiddenWarning(hiddenWarningElement) {
  if (!hiddenWarningElement) return;
  const message = getHiddenWarningMessage();
  hiddenWarningElement.textContent = message;
  hiddenWarningElement.style.display = message ? 'block' : 'none';
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

export function setActionAndStatusColumnsVisibility(visible) {
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

export function updateHeaderFooter() {
  const statusElement = getCachedElement('statusElement');
  const sortButton = getCachedElement('sortButton');
  const tabsSortedElement = getCachedElement('tabsSortedElement');
  const table = getCachedElement('table');
  const hiddenWarningElement = getCachedElement('hiddenWarningElement');

  const readySubsetExists =
    popupState.readyTabCount >= 2 &&
    popupState.readyTabCount < popupState.trackedTabCount;
  const readySubsetNeedsSorting =
    readySubsetExists && (!popupState.areReadyTabsContiguous || !popupState.areReadyTabsAtFront);
  const shouldShowSort =
    popupState.readyTabCount >= 2 &&
    !popupState.areTrackedTabsSorted &&
    (popupState.areReadyTabsOutOfOrder || readySubsetNeedsSorting);

  setOptionToggleVisibility(shouldShowSort);

  updateStatus(statusElement);
  updateTabsSorted(tabsSortedElement);
  updateHiddenWarning(hiddenWarningElement);
  updateSortButton(sortButton, shouldShowSort);

  if (popupState.areTrackedTabsSorted && table) {
    clearReadyRows(table);
  }
}

export function addClassToAllRows(table, className) {
  for (let i = 1; i < table.rows.length; i += 1) {
    table.rows[i].classList.add(className);
  }
}
