import { MESSAGE_TYPES } from '../shared/constants.js';
import { toErrorMessage } from '../shared/errors.js';
import { EMPTY_SORT_SUMMARY } from '../shared/sort-summary.js';
import { loadSortOptions, persistSortOptions } from '../shared/storage.js';
import { shouldAutoRefreshSnapshot } from './snapshot-refresh.js';
import { popupViewModel, setActiveWindowId, updatePopupViewModel } from './view-model.js';
import { insertRowCells } from './tab-row.js';
import { startThemeSync } from './theme.js';
import {
  addClassToAllRows,
  initializeView,
  renderHeaderView,
  setErrorMessage,
  setSecondaryColumnsVisible,
} from './header-view.js';

const SNAPSHOT_RETRY_DELAY_MS = 150;
const SNAPSHOT_MAX_ATTEMPTS = 2;
const SNAPSHOT_POLL_DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let snapshotPollTimeoutId = null;
let snapshotPollInFlight = false;
let popupRuntimeActive = false;

export function shouldRetrySnapshotPoll(snapshot, runtimeActive = popupRuntimeActive) {
  return Boolean(runtimeActive) && snapshot == null;
}

function clearSnapshotPollTimeout() {
  if (snapshotPollTimeoutId == null) return;
  clearTimeout(snapshotPollTimeoutId);
  snapshotPollTimeoutId = null;
}

function scheduleSnapshotPoll() {
  if (snapshotPollTimeoutId != null || snapshotPollInFlight) return;
  snapshotPollTimeoutId = setTimeout(async () => {
    snapshotPollTimeoutId = null;
    snapshotPollInFlight = true;
    let snapshot = null;
    try {
      snapshot = await loadSnapshot();
      if (snapshot) renderSnapshot(snapshot);
    } catch (error) {
      logPopupError('Failed to refresh pending tab snapshot', error);
    } finally {
      snapshotPollInFlight = false;
      if (shouldRetrySnapshotPoll(snapshot)) {
        scheduleSnapshotPoll();
      }
    }
  }, SNAPSHOT_POLL_DELAY_MS);
}

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
  if (typeof popupViewModel.activeWindowId === 'number' && message.windowId == null) {
    message.windowId = popupViewModel.activeWindowId;
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

function normalizeSortSummary(sortSummary) {
  return {
    ...EMPTY_SORT_SUMMARY,
    ...(sortSummary || {}),
    counts: {
      ...EMPTY_SORT_SUMMARY.counts,
      ...(sortSummary?.counts || {}),
    },
    readyTabs: {
      ...EMPTY_SORT_SUMMARY.readyTabs,
      ...(sortSummary?.readyTabs || {}),
    },
    backgroundTabs: {
      ...EMPTY_SORT_SUMMARY.backgroundTabs,
      ...(sortSummary?.backgroundTabs || {}),
    },
    order: {
      ...EMPTY_SORT_SUMMARY.order,
      ...(sortSummary?.order || {}),
    },
  };
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
      if (isValidSnapshot(response)) {
        setErrorMessage('');
        return response;
      }
      lastError = new Error('Invalid snapshot response');
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    setErrorMessage('Could not load tab data. Try reopening the popup.');
    logPopupMessage(MESSAGE_TYPES.ERROR, `Failed to load tab records: ${toErrorMessage(lastError)}`);
  }
  return null;
}

function renderSnapshot(snapshot) {
  if (!snapshot) return;
  setErrorMessage('');

  const table = document.getElementById('infoTable');
  if (!table) return;
  const tbody = table.tBodies[0] ?? table.createTBody();

  const tabRecords = snapshot.trackedTabsById || {};
  const visibleOrder = snapshot.visibleOrder || [];
  const sortSummary = normalizeSortSummary(snapshot.sortSummary);
  const backgroundSortedFlag = snapshot.allSortableTabsSorted === true;
  const shouldUseSortedView =
    sortSummary.order.allSorted ||
    (backgroundSortedFlag &&
      sortSummary.order.allRemainingTimesKnown &&
      !sortSummary.readyTabs.outOfOrder);

  updatePopupViewModel({
    allSortableTabsSorted: shouldUseSortedView,
    sortSummary,
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

  if (sortSummary.order.allRemainingTimesKnown && !shouldUseSortedView) {
    addClassToAllRows(table, 'all-ready-row');
  }

  renderHeaderView();

  clearSnapshotPollTimeout();
  if (shouldAutoRefreshSnapshot(snapshot)) {
    scheduleSnapshotPoll();
  }
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

export async function initializePopupRuntime() {
  popupRuntimeActive = true;
  initializeView();
  renderHeaderView();
  setErrorMessage('');

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
    popupRuntimeActive = false;
    clearSnapshotPollTimeout();
    chrome.runtime.onMessage.removeListener(messageListener);
  });
}

function canBootstrapPopupRuntime() {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    Boolean(globalThis.chrome?.runtime?.sendMessage)
  );
}

if (canBootstrapPopupRuntime()) {
  initializePopupRuntime().catch((error) => {
    logPopupMessage(MESSAGE_TYPES.ERROR, `Failed to initialize popup: ${toErrorMessage(error)}`);
  });
}
