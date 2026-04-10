import { MESSAGE_TYPES } from '../shared/constants.js';
import { loadSortOptions, persistSortOptions } from '../shared/storage.js';
import { toErrorMessage } from '../shared/utils.js';
import { createPopupRuntimeClient } from './popup-runtime-client.js';
import { createSnapshotClient } from './popup-snapshot-client.js';
import {
  createSnapshotPoller,
  shouldAutoRefreshRecord,
  shouldAutoRefreshSnapshot,
  shouldRetrySnapshotPoll,
} from './popup-snapshot-poller.js';
import { renderSnapshot } from './popup-snapshot-view.js';
import {
  initializePopupView,
  popupViewState,
  renderPopupView,
  setActiveWindowId,
  setErrorMessage,
} from './popup-view.js';
import { startThemeSync } from './theme.js';

const SNAPSHOT_RETRY_DELAY_MS = 150;
const SNAPSHOT_MAX_ATTEMPTS = 2;
const SNAPSHOT_POLL_DELAY_MS = 1000;

let popupControllerActive = false;

const runtimeClient = createPopupRuntimeClient({
  getActiveWindowId: () => popupViewState.activeWindowId,
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
  isControllerActive: () => popupControllerActive,
  loadSnapshot: snapshotClient.loadSnapshot,
  logPopupError: runtimeClient.logPopupError,
  onSnapshot: (snapshot) => {
    renderSnapshot(snapshot, {
      postRuntimeMessage: runtimeClient.postRuntimeMessage,
    });
  },
});

async function runSafely(task, context) {
  try {
    return await task();
  } catch (error) {
    runtimeClient.logPopupError(context, error);
    return null;
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

export async function initializePopupController() {
  popupControllerActive = true;
  initializePopupView();
  renderPopupView();
  setErrorMessage('');

  await runSafely(runtimeClient.syncActiveWindow, 'Failed to refresh active context');
  await runSafely(initializeControls, 'Failed to set up option controls');
  await runSafely(async () => {
    const snapshot = await snapshotClient.loadSnapshot();
    if (snapshot) {
      renderSnapshot(snapshot, {
        postRuntimeMessage: runtimeClient.postRuntimeMessage,
      });
      snapshotPoller.refreshIfNeeded(snapshot);
    }
  }, 'Failed to request initial snapshot');

  const messageListener = (message) => {
    if (message?.type === 'tabSnapshotUpdated' && message.payload) {
      Promise.resolve().then(() => {
        renderSnapshot(message.payload, {
          postRuntimeMessage: runtimeClient.postRuntimeMessage,
        });
        snapshotPoller.refreshIfNeeded(message.payload);
      }).catch((error) => {
        runtimeClient.logPopupError('Failed to render incoming snapshot', error);
      });
    }
  };

  chrome.runtime.onMessage.addListener(messageListener);

  const sortButton = document.getElementById('sortButton');
  if (sortButton) {
    sortButton.addEventListener('click', () => runtimeClient.postRuntimeMessage('sortWindowTabs'));
  }

  window.addEventListener('unload', () => {
    popupControllerActive = false;
    snapshotPoller.clear();
    chrome.runtime.onMessage.removeListener(messageListener);
  });
}

function canBootstrapPopupController() {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    Boolean(globalThis.chrome?.runtime?.sendMessage)
  );
}

if (canBootstrapPopupController()) {
  initializePopupController().catch((error) => {
    runtimeClient.logPopupMessage(
      MESSAGE_TYPES.ERROR,
      `Failed to initialize popup: ${toErrorMessage(error)}`,
    );
  });
}

export {
  shouldAutoRefreshRecord,
  shouldAutoRefreshSnapshot,
  shouldRetrySnapshotPoll,
};
