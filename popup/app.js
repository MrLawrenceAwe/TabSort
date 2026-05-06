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
import { renderPopupShell } from './layout.js';
import { initializePopupDom, setErrorMessage } from './dom.js';
import { popupState, setActiveWindowId } from './state.js';
import { startThemeSync } from './theme.js';

const SNAPSHOT_RETRY_DELAY_MS = 150;
const SNAPSHOT_MAX_ATTEMPTS = 2;
const SNAPSHOT_POLL_DELAY_MS = 1000;

let isPopupAppActive = false;

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
  isAppActive: () => isPopupAppActive,
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
  const groupNonYoutubeToggle = document.getElementById('groupNonYoutubeTabsToggle');

  if (groupNonYoutubeToggle) {
    groupNonYoutubeToggle.checked = Boolean(options.groupNonYoutubeTabsByDomain);
    groupNonYoutubeToggle.addEventListener('change', () => {
      saveSortOptions({ groupNonYoutubeTabsByDomain: groupNonYoutubeToggle.checked });
    });
  }
}

export async function initializePopupApp() {
  isPopupAppActive = true;
  initializePopupDom();
  renderPopupShell();
  setErrorMessage('');

  await runWithPopupErrorLogging(runtimeClient.syncActiveWindow, 'Failed to refresh active context');
  await runWithPopupErrorLogging(initializeSortOptions, 'Failed to set up option controls');
  await runWithPopupErrorLogging(async () => {
    const snapshot = await snapshotClient.loadSnapshot();
    if (snapshot) {
      renderSnapshot(snapshot, {
        postRuntimeMessage: runtimeClient.postRuntimeMessage,
      });
      snapshotPoller.scheduleIfNeeded(snapshot);
    }
  }, 'Failed to request initial snapshot');

  const messageListener = (message) => {
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

  chrome.runtime.onMessage.addListener(messageListener);

  const sortButton = document.getElementById('sortButton');
  if (sortButton) {
    sortButton.addEventListener('click', () =>
      runtimeClient.postRuntimeMessage(RUNTIME_MESSAGE_TYPES.REORDER_WINDOW_TABS),
    );
  }

  window.addEventListener('unload', () => {
    isPopupAppActive = false;
    snapshotPoller.clear();
    chrome.runtime.onMessage.removeListener(messageListener);
  });
}

function canBootstrapPopupApp() {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    Boolean(globalThis.chrome?.runtime?.sendMessage)
  );
}

if (canBootstrapPopupApp()) {
  initializePopupApp().catch((error) => {
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
