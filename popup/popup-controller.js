import { POPUP_LOG_LEVELS, toErrorMessage } from '../shared/log.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { loadSortOptions, saveSortOptions } from '../shared/storage.js';
import { createRuntimeClient } from './runtime-client.js';
import { createTabSnapshotClient } from './tab-snapshot-client.js';
import { createSnapshotPoller } from './snapshot-poller.js';
import { renderTabList } from './render-tab-list.js';
import { syncPopupLayout } from './popup-layout-view.js';
import {
  initializePopupDom,
  setErrorMessage,
  setNoticeMessage,
  setStateMessage,
} from './popup-elements.js';
import {
  isSnapshotForActiveWindow,
  popupState,
  applyPopupState,
  setActiveWindowId,
} from './popup-store.js';
import { startThemeSync } from './theme.js';

const SNAPSHOT_RETRY_DELAY_MS = 150;
const SNAPSHOT_MAX_ATTEMPTS = 2;
const SNAPSHOT_POLL_DELAY_MS = 1000;

let isPopupActive = false;

const runtimeClient = createRuntimeClient({
  getActiveWindowId: () => popupState.activeWindowId,
  setActiveWindowId,
});
const snapshotClient = createTabSnapshotClient({
  requestRuntimeMessage: runtimeClient.requestRuntimeMessage,
  syncActiveWindow: runtimeClient.syncActiveWindow,
  setErrorMessage,
  logPopupMessage: runtimeClient.logPopupMessage,
  toErrorMessage,
  retryDelayMs: SNAPSHOT_RETRY_DELAY_MS,
  maxAttempts: SNAPSHOT_MAX_ATTEMPTS,
});
const snapshotPoller = createSnapshotPoller({
  delayMs: SNAPSHOT_POLL_DELAY_MS,
  isAppActive: () => isPopupActive,
  loadSnapshot: snapshotClient.loadSnapshot,
  logPopupError: runtimeClient.logPopupError,
  onSnapshot: renderAndScheduleSnapshot,
});

async function runWithPopupErrorLogging(task, context) {
  try {
    return await task();
  } catch (error) {
    runtimeClient.logPopupError(context, error);
    return null;
  }
}

async function initializePopupPreferences() {
  startThemeSync();
  const options = await loadSortOptions();
  const groupOtherTabsToggle = document.getElementById('groupOtherTabsToggle');

  if (groupOtherTabsToggle) {
    groupOtherTabsToggle.checked = Boolean(options.groupOtherTabsBySite);
    groupOtherTabsToggle.addEventListener('change', () => {
      saveSortOptions({ groupOtherTabsBySite: groupOtherTabsToggle.checked });
    });
  }
}

function renderAndScheduleSnapshot(snapshot) {
  renderTabList(snapshot, {
    requestTabAction,
  });
  snapshotPoller.scheduleIfNeeded(snapshot);
}

async function loadInitialSnapshot() {
  const snapshot = await snapshotClient.loadSnapshot();
  if (!snapshot) {
    setStateMessage('Tab data is unavailable.');
    return;
  }
  renderAndScheduleSnapshot(snapshot);
}

const ACTION_ERROR_MESSAGES = Object.freeze({
  invalidTabId: 'That tab is no longer available.',
  tabNotTracked: 'That YouTube tab is no longer being tracked.',
  windowMismatch: 'The tab moved to another window. Reopen the popup and try again.',
  openFailed: 'Could not open that tab.',
  reloadFailed: 'Could not reload that tab.',
});

async function requestTabAction(type, data) {
  setErrorMessage('');
  setNoticeMessage('');
  try {
    const response = await runtimeClient.requestRuntimeMessage(type, data);
    if (response?.ok === true) return true;
    setErrorMessage(ACTION_ERROR_MESSAGES[response?.error] || 'The tab action could not be completed.');
  } catch (error) {
    setErrorMessage('The tab action could not be completed. Try again.');
    runtimeClient.logPopupError('Tab action failed', error);
  }
  return false;
}

async function requestSort() {
  if (popupState.isSorting) return;
  applyPopupState({ isSorting: true });
  setErrorMessage('');
  setNoticeMessage('');
  syncPopupLayout();
  try {
    const response = await runtimeClient.requestRuntimeMessage(RUNTIME_MESSAGE_TYPES.SORT_TABS);
    if (response?.ok !== true) {
      setErrorMessage('Could not organise the tabs. Try again.');
      return;
    }
    if (response.movedCount > 0) {
      setNoticeMessage(
        `Organised ${response.movedCount} tab${response.movedCount === 1 ? '' : 's'}.`,
      );
    }
  } catch (error) {
    setErrorMessage('Could not organise the tabs. Try again.');
    runtimeClient.logPopupError('Sorting tabs failed', error);
  } finally {
    applyPopupState({ isSorting: false });
    syncPopupLayout();
  }
}

function createSnapshotMessageListener() {
  return (message) => {
    if (message?.type === RUNTIME_MESSAGE_TYPES.TAB_SNAPSHOT_UPDATED && message.payload) {
      if (!isSnapshotForActiveWindow(message.payload)) return;
      Promise.resolve().then(() => {
        renderAndScheduleSnapshot(message.payload);
      }).catch((error) => {
        runtimeClient.logPopupError('Failed to render incoming snapshot', error);
      });
    }
  };
}

function registerPopupControls() {
  const sortButton = document.getElementById('sortButton');
  if (sortButton) {
    sortButton.addEventListener('click', requestSort);
  }
}

function registerPopupLifecycle(messageListener) {
  chrome.runtime.onMessage.addListener(messageListener);
  window.addEventListener('unload', () => {
    isPopupActive = false;
    snapshotPoller.clear();
    chrome.runtime.onMessage.removeListener(messageListener);
  });
}

export async function initializePopup() {
  isPopupActive = true;
  initializePopupDom();
  syncPopupLayout();
  setErrorMessage('');
  setNoticeMessage('');
  setStateMessage('Loading YouTube tabs…');

  await runWithPopupErrorLogging(runtimeClient.syncActiveWindow, 'Failed to refresh active context');
  await runWithPopupErrorLogging(initializePopupPreferences, 'Failed to set up option controls');
  await runWithPopupErrorLogging(loadInitialSnapshot, 'Failed to request initial snapshot');

  const messageListener = createSnapshotMessageListener();
  registerPopupControls();
  registerPopupLifecycle(messageListener);
}

function canBootstrapPopup() {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    Boolean(globalThis.chrome?.runtime?.sendMessage)
  );
}

if (canBootstrapPopup()) {
  initializePopup().catch((error) => {
    runtimeClient.logPopupMessage(
      POPUP_LOG_LEVELS.ERROR,
      `Failed to initialize popup: ${toErrorMessage(error)}`,
    );
  });
}
