import { MESSAGE_TYPES } from '../shared/constants.js';
import { toErrorMessage } from '../shared/errors.js';
import { EMPTY_READINESS_METRICS } from '../shared/readiness.js';
import { loadSortOptions, persistSortOptions } from '../shared/storage.js';
import { popupState, setActiveWindowId, updatePopupState } from './state.js';
import { insertRowCells } from './table.js';
import { startThemeSync } from './theme.js';
import {
  addClassToAllRows,
  initializeView,
  renderHeaderState,
  setSecondaryColumnsVisible,
} from './view.js';

const SNAPSHOT_RETRY_DELAY_MS = 150;
const SNAPSHOT_MAX_ATTEMPTS = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function logPopupMessage(type = MESSAGE_TYPES.ERROR, message = 'Message is undefined') {
  const logger = type === MESSAGE_TYPES.ERROR ? 'error' : 'log';
  console[logger](`[Popup] ${message}`);
  postRuntimeMessage('logPopupMessage', { level: type, text: message });
}

function logPopupError(context, error) {
  const message = toErrorMessage(error);
  if (message === 'No active tab') {
    console.debug(`[Popup] ${context}: ${message}`);
    return;
  }
  logPopupMessage(MESSAGE_TYPES.ERROR, `${context}: ${message}`);
}

async function runSafely(task, context) {
  try {
    return await task();
  } catch (error) {
    logPopupError(context, error);
    return null;
  }
}

function syncActiveWindow() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const err = chrome.runtime.lastError;
      if (err) {
        setActiveWindowId(null);
        reject(err);
        return;
      }
      if (tabs && tabs.length) {
        const tab = tabs[0];
        setActiveWindowId(typeof tab.windowId === 'number' ? tab.windowId : null);
        resolve({ tabId: tab.id, windowId: typeof tab.windowId === 'number' ? tab.windowId : null });
        return;
      }
      setActiveWindowId(null);
      reject(new Error('No active tab'));
    });
  });
}

function postRuntimeMessage(type, data = {}, callback) {
  const message = { type, ...data };
  if (typeof popupState.activeWindowId === 'number' && message.windowId == null) {
    message.windowId = popupState.activeWindowId;
  }
  if (typeof callback === 'function') {
    return chrome.runtime.sendMessage(message, callback);
  }
  return chrome.runtime.sendMessage(message);
}

function requestRuntimeMessage(type, data = {}) {
  return new Promise((resolve, reject) => {
    postRuntimeMessage(type, data, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(err);
        return;
      }
      resolve(response);
    });
  });
}

function isValidSnapshot(snapshot) {
  return snapshot && typeof snapshot === 'object' && 'trackedTabsById' in snapshot;
}

async function loadSnapshot() {
  let lastError = null;

  for (let attempt = 1; attempt <= SNAPSHOT_MAX_ATTEMPTS; attempt += 1) {
    try {
      if (attempt > 1) {
        await syncActiveWindow().catch(() => {});
        await requestRuntimeMessage('ping').catch(() => {});
        await sleep(SNAPSHOT_RETRY_DELAY_MS);
      }
      const response = await requestRuntimeMessage('getTabSnapshot', {});
      if (isValidSnapshot(response)) return response;
      lastError = new Error('Invalid snapshot response');
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    logPopupMessage(MESSAGE_TYPES.ERROR, `Failed to load tab records: ${toErrorMessage(lastError)}`);
  }
  return null;
}

function renderSnapshot(snapshot) {
  if (!snapshot) return;

  const table = document.getElementById('infoTable');
  if (!table) return;
  const tbody = table.tBodies[0] ?? table.createTBody();

  const tabRecords = snapshot.trackedTabsById || {};
  const visibleOrder = snapshot.visibleOrder || [];
  const readiness = { ...EMPTY_READINESS_METRICS, ...(snapshot.readiness || {}) };
  const backgroundSortedFlag = snapshot.tabsSorted === true;
  const shouldUseSortedView =
    readiness.areAllSorted ||
    (backgroundSortedFlag && readiness.areAllTimesKnown && !readiness.areReadyTabsOutOfOrder);

  updatePopupState({
    tabsSorted: shouldUseSortedView,
    trackedTabCount: readiness.trackedTabCount,
    readyTabCount: readiness.readyTabCount,
    areReadyTabsOutOfOrder: readiness.areReadyTabsOutOfOrder,
    hasBackgroundTabsWithStaleRemaining: readiness.hasBackgroundTabsWithStaleRemaining,
    areReadyTabsContiguous: readiness.areReadyTabsContiguous,
    areReadyTabsAtFront: readiness.areReadyTabsAtFront,
  });

  setSecondaryColumnsVisible(!shouldUseSortedView);

  const rowFragment = document.createDocumentFragment();
  for (const tabId of visibleOrder) {
    const row = document.createElement('tr');
    const tabRecord = tabRecords[tabId];
    if (!tabRecord) continue;
    const normalizedRecord = {
      ...tabRecord,
      isRemainingTimeStale: Boolean(tabRecord.isRemainingTimeStale),
    };
    if (normalizedRecord.isRemainingTimeStale) row.classList.add('stale-remaining-row');
    insertRowCells(row, normalizedRecord, shouldUseSortedView, postRuntimeMessage);
    rowFragment.appendChild(row);
  }
  tbody.replaceChildren(rowFragment);

  if (readiness.areAllTimesKnown && !shouldUseSortedView) {
    addClassToAllRows(table, 'all-ready-row');
  }

  renderHeaderState();
}

async function initializeControls() {
  startThemeSync();
  const options = await loadSortOptions();
  const groupNonYoutubeToggle = document.getElementById('groupNonYoutubeTabsToggle');

  if (groupNonYoutubeToggle) {
    groupNonYoutubeToggle.checked = Boolean(options.groupNonYoutubeTabsByDomain);
    groupNonYoutubeToggle.addEventListener('change', () => {
      persistSortOptions({ groupNonYoutubeTabsByDomain: groupNonYoutubeToggle.checked });
    });
  }
}

export async function initializePopupController() {
  initializeView();

  await runSafely(syncActiveWindow, 'Failed to refresh active context');
  await runSafely(initializeControls, 'Failed to set up option controls');
  await runSafely(async () => {
    const snapshot = await loadSnapshot();
    if (snapshot) renderSnapshot(snapshot);
  }, 'Failed to request initial snapshot');

  const messageListener = (message) => {
    if (message?.type === 'tabSnapshotUpdated' && message.payload) {
      Promise.resolve(renderSnapshot(message.payload)).catch((error) => {
        logPopupError('Failed to render incoming snapshot', error);
      });
    }
  };

  chrome.runtime.onMessage.addListener(messageListener);

  const sortButton = document.getElementById('sortButton');
  if (sortButton) {
    sortButton.addEventListener('click', () => postRuntimeMessage('sortWindowTabs'));
  }

  window.addEventListener('unload', () => {
    chrome.runtime.onMessage.removeListener(messageListener);
  });
}

initializePopupController().catch((error) => {
  logPopupMessage(MESSAGE_TYPES.ERROR, `Failed to initialize popup: ${toErrorMessage(error)}`);
});
