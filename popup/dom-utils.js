import { popupState } from './state.js';

/** Cached DOM element references */
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

/**
 * Initializes the DOM cache with element references.
 * Should be called once when the popup loads.
 */
export function initializeDomCache() {
  if (domCache.initialized) return;

  domCache.statusElement = document.getElementById('youtubeWatchTabsReadyStatus');
  domCache.sortButton = document.getElementById('sortButton');
  domCache.tabsSortedElement = document.getElementById('tabsSorted');
  domCache.table = document.getElementById('infoTable');
  domCache.hiddenWarningElement = document.getElementById('hiddenTabWarning');
  domCache.actionRequiredColumn = document.querySelector('.action-required');
  domCache.tabStatusColumn = document.querySelector('.tab-status');
  domCache.initialized = true;
}

/**
 * Gets a cached DOM element, initializing cache if needed.
 * @param {string} key - The cache key.
 * @returns {HTMLElement|null}
 */
function getCachedElement(key) {
  if (!domCache.initialized) initializeDomCache();
  return domCache[key];
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

  if (statusElement) {
    if (!popupState.tabsInCurrentWindowAreKnownToBeSorted) {
      statusElement.style.display = popupState.totalWatchTabsInWindow <= 1 ? 'none' : 'block';
      statusElement.textContent = `${popupState.watchTabsReadyCount}/${popupState.totalWatchTabsInWindow} ready for sort.`;
      statusElement.style.color = 'var(--status-text-color)';
    } else {
      statusElement.style.display = 'none';
    }
  }

  if (tabsSortedElement) {
    tabsSortedElement.style.display = popupState.tabsInCurrentWindowAreKnownToBeSorted ? 'block' : 'none';
  }

  if (hiddenWarningElement) {
    if (popupState.hiddenTabsMayHaveStaleRemaining) {
      hiddenWarningElement.textContent =
        'Remaining time may stay at the full length until you view paused background tabs.';
      hiddenWarningElement.style.display = 'block';
    } else {
      hiddenWarningElement.style.display = 'none';
    }
  }

  const readySubsetExists =
    popupState.watchTabsReadyCount >= 2 &&
    popupState.watchTabsReadyCount < popupState.totalWatchTabsInWindow;
  const readySubsetNeedsSorting =
    readySubsetExists && (!popupState.readyTabsAreContiguous || !popupState.readyTabsAreAtFront);
  const shouldShowSort =
    popupState.watchTabsReadyCount >= 2 &&
    !popupState.tabsInCurrentWindowAreKnownToBeSorted &&
    (popupState.knownWatchTabsOutOfOrder || readySubsetNeedsSorting);

  setOptionToggleVisibility(shouldShowSort);

  if (sortButton) {
    if (shouldShowSort) {
      sortButton.style.setProperty('display', 'block', 'important');
      const allTabsReady = popupState.watchTabsReadyCount === popupState.totalWatchTabsInWindow;
      const readyBackground = 'var(--all-ready-row-background)';
      const readyText = 'var(--all-ready-row-text)';
      sortButton.style.backgroundColor = allTabsReady ? readyBackground : 'var(--action-button-background)';
      sortButton.style.color = allTabsReady ? readyText : 'var(--action-button-color)';
      sortButton.style.borderColor = allTabsReady ? readyBackground : 'var(--action-button-border-color)';
      sortButton.textContent =
        allTabsReady ? 'Sort All Tabs' : 'Sort Ready Tabs';
    } else {
      sortButton.style.setProperty('display', 'none', 'important');
    }
  }

  if (popupState.tabsInCurrentWindowAreKnownToBeSorted && table) {
    for (let i = 1; i < table.rows.length; i += 1) {
      table.rows[i].classList.remove('ready-row');
    }
  }
}

export function addClassToAllRows(table, className) {
  for (let i = 1; i < table.rows.length; i += 1) {
    table.rows[i].classList.add(className);
  }
}
