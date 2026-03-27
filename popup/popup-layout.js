import { popupStore } from './popup-store.js';

const domCache = {
  statusElement: null,
  sortButton: null,
  tabsSortedElement: null,
  table: null,
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
  if (!popupStore.areTrackedTabsSorted) {
    statusElement.style.display = popupStore.trackedTabCount <= 1 ? 'none' : 'block';
    statusElement.textContent = `${popupStore.readyTabCount}/${popupStore.trackedTabCount} ready for sort.`;
    statusElement.style.color = 'var(--status-text-color)';
    return;
  }
  statusElement.style.display = 'none';
}

function updateTabsSorted(tabsSortedElement) {
  if (!tabsSortedElement) return;
  tabsSortedElement.style.display = popupStore.areTrackedTabsSorted ? 'block' : 'none';
}

function updateSortButton(sortButton, shouldShowSort) {
  if (!sortButton) return;
  if (shouldShowSort) {
    sortButton.style.setProperty('display', 'block', 'important');
    const allTabsReady = popupStore.readyTabCount === popupStore.trackedTabCount;
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

  const readySubsetExists =
    popupStore.readyTabCount >= 2 &&
    popupStore.readyTabCount < popupStore.trackedTabCount;
  const readySubsetNeedsSorting =
    readySubsetExists && (!popupStore.areReadyTabsContiguous || !popupStore.areReadyTabsAtFront);
  const shouldShowSort =
    popupStore.readyTabCount >= 2 &&
    !popupStore.areTrackedTabsSorted &&
    (popupStore.areReadyTabsOutOfOrder || readySubsetNeedsSorting);

  setOptionToggleVisibility(shouldShowSort);

  updateStatus(statusElement);
  updateTabsSorted(tabsSortedElement);
  updateSortButton(sortButton, shouldShowSort);

  if (popupStore.areTrackedTabsSorted && table) {
    clearReadyRows(table);
  }
}

export function addClassToAllRows(table, className) {
  for (let i = 1; i < table.rows.length; i += 1) {
    table.rows[i].classList.add(className);
  }
}
