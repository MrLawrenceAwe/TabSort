import { POPUP_LOG_LEVELS } from '../shared/log-levels.js';
import { toErrorMessage } from '../shared/errors.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { loadSortOptions, saveSortOptions } from '../shared/storage.js';
import { createRuntimeClient } from './runtime-client.js';
import { createSnapshotClient } from './snapshot-client.js';
import {
  createSnapshotPoller,
  shouldPollRecord,
  shouldPollSnapshot,
  shouldRetrySnapshotPoll,
} from './snapshot-poller.js';
import { renderSnapshot } from './snapshot-renderer.js';
import { renderPopupShell } from './popup-shell-view.js';
import { initializePopupDom, setErrorMessage } from './popup-elements.js';
import { popupState, setActiveWindowId } from './popup-store.js';
import { startThemeSync } from './theme.js';

const SNAPSHOT_RETRY_DELAY_MS = 150;
const SNAPSHOT_MAX_ATTEMPTS = 2;
const SNAPSHOT_POLL_DELAY_MS = 1000;

let isPopupActive = false;

const runtimeClient = createRuntimeClient({
  getActiveWindowId: () => popupState.activeWindowId,
  setActiveWindowId,
});
const snapshotClient = createSnapshotClient({
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
  onSnapshot: (snapshot) => {
    renderSnapshot(snapshot, {
      postRuntimeMessage: runtimeClient.postRuntimeMessage,
    });
  },
});

async function runWithPopupErrorLogging(task, context) {
  try {
    return await task();
  } catch (error) {
    runtimeClient.logPopupError(context, error);
    return null;
  }
}

async function initializeSortOptions() {
  startThemeSync();
  const options = await loadSortOptions();
  const sortOtherTabsToggle = document.getElementById('groupNonYoutubeTabsToggle');

  if (sortOtherTabsToggle) {
    sortOtherTabsToggle.checked = Boolean(options.groupNonYoutubeTabsByDomain);
    sortOtherTabsToggle.addEventListener('change', () => {
      saveSortOptions({ groupNonYoutubeTabsByDomain: sortOtherTabsToggle.checked });
    });
  }
}

async function loadInitialSnapshot() {
  const snapshot = await snapshotClient.loadSnapshot();
  if (!snapshot) return;
  renderSnapshot(snapshot, {
    postRuntimeMessage: runtimeClient.postRuntimeMessage,
  });
  snapshotPoller.scheduleIfNeeded(snapshot);
}

function createSnapshotMessageListener() {
  return (message) => {
    if (message?.type === RUNTIME_MESSAGE_TYPES.TAB_SNAPSHOT_UPDATED && message.payload) {
      Promise.resolve().then(() => {
        renderSnapshot(message.payload, {
          postRuntimeMessage: runtimeClient.postRuntimeMessage,
        });
        snapshotPoller.scheduleIfNeeded(message.payload);
      }).catch((error) => {
        runtimeClient.logPopupError('Failed to render incoming snapshot', error);
      });
    }
  };
}

function registerPopupControls() {
  const sortButton = document.getElementById('sortButton');
  if (sortButton) {
    sortButton.addEventListener('click', () =>
      runtimeClient.postRuntimeMessage(RUNTIME_MESSAGE_TYPES.REORDER_WINDOW_TABS),
    );
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
  renderPopupShell();
  setErrorMessage('');

  await runWithPopupErrorLogging(runtimeClient.syncActiveWindow, 'Failed to refresh active context');
  await runWithPopupErrorLogging(initializeSortOptions, 'Failed to set up option controls');
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

export {
  shouldPollRecord,
  shouldPollSnapshot,
  shouldRetrySnapshotPoll,
};
