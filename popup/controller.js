import { createSortSummary } from '../shared/sorting/summary.js';
import { createBacklogSummary, formatBacklogSummary } from './backlog-summary.js';
import { POPUP_LOG_LEVELS, toErrorMessage } from '../shared/log.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { loadPreferences, savePreferences } from '../shared/preferences.js';
import { createRuntimeClient } from './runtime-client.js';
import { createTabSnapshotClient } from './tab-snapshot-client.js';
import { createSnapshotPoller } from './snapshot-poller.js';
import { renderTabList } from './tab-list-view.js';
import { syncPopupLayout, setNextStepHeaderVisible } from './layout-view.js';
import {
  initializePopupDom,
  getPopupElement,
  setErrorMessage,
  setNoticeMessage,
  setStateMessage,
  setBacklogSummary,
} from './elements.js';
import {
  isSnapshotForActiveWindow,
  popupState,
  applyPopupState,
  setActiveWindowId,
} from './store.js';

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
  const options = await loadPreferences();
  const groupOtherTabsToggle = getPopupElement('groupOtherTabsToggle');
  const openTikTokPipToggle = getPopupElement('openTikTokPipToggle');

  if (groupOtherTabsToggle) {
    groupOtherTabsToggle.checked = Boolean(options.groupOtherTabsBySite);
    groupOtherTabsToggle.addEventListener('change', () => {
      savePreferences({ groupOtherTabsBySite: groupOtherTabsToggle.checked });
    });
  }
  if (openTikTokPipToggle) {
    openTikTokPipToggle.checked = Boolean(options.openTikTokPipOnAutoPrepare);
    openTikTokPipToggle.addEventListener('change', () => {
      savePreferences({ openTikTokPipOnAutoPrepare: openTikTokPipToggle.checked });
    });
  }
}

export function applyTabSnapshot(snapshot) {
  if (!snapshot) return;
  const records = (snapshot.trackedTabOrder ?? [])
    .map(tabId => snapshot.tabRecordsById?.[tabId])
    .filter(Boolean);
  const allVideosReadyAndOrdered = snapshot.allVideosReadyAndOrdered === true;
  applyPopupState({
    allVideosReadyAndOrdered,
    sortSummary: createSortSummary(snapshot.sortSummary),
    autoPreparation: snapshot.autoPreparation ?? { status: 'idle' },
  });
  setErrorMessage('');
  setNextStepHeaderVisible(!allVideosReadyAndOrdered);
  renderTabList(records, { allVideosReadyAndOrdered, requestTabAction });
  setStateMessage(records.length ? '' : 'No YouTube video tabs in this window.');
  setBacklogSummary(formatBacklogSummary(createBacklogSummary(records)));
  syncPopupLayout();
}

function renderAndScheduleSnapshot(snapshot) {
  applyTabSnapshot(snapshot);
  if (popupState.autoPreparation.status !== 'running') snapshotPoller.scheduleIfNeeded(snapshot);
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
  activateFailed: 'Could not view that tab.',
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

async function requestAutoPrepare() {
  if (popupState.isStartingAutoPreparation || popupState.autoPreparation.status === 'running') return;
  applyPopupState({ isStartingAutoPreparation: true });
  snapshotPoller.clear();
  setErrorMessage('');
  setNoticeMessage('');
  syncPopupLayout();
  try {
    const response = await runtimeClient.requestRuntimeMessage(
      RUNTIME_MESSAGE_TYPES.START_AUTO_PREPARATION,
      { openTikTokPip: Boolean(getPopupElement('openTikTokPipToggle')?.checked) },
    );
    if (response?.ok !== true) setErrorMessage('Could not start auto-preparation. Reopen TabSort and try again.');
  } catch (error) {
    setErrorMessage('Could not start auto-preparation. Try again.');
    runtimeClient.logPopupError('Starting auto-preparation failed', error);
  } finally {
    applyPopupState({ isStartingAutoPreparation: false });
    syncPopupLayout();
  }
}

async function requestStopAutoPreparation() {
  await requestTabAction(RUNTIME_MESSAGE_TYPES.STOP_AUTO_PREPARATION);
}

async function requestOrganise() {
  if (popupState.isOrganising || (popupState.isStartingAutoPreparation || popupState.autoPreparation.status === 'running')) return;
  applyPopupState({ isOrganising: true });
  setErrorMessage('');
  setNoticeMessage('');
  syncPopupLayout();
  try {
    const response = await runtimeClient.requestRuntimeMessage(RUNTIME_MESSAGE_TYPES.ORGANISE_TABS);
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
    runtimeClient.logPopupError('Organising tabs failed', error);
  } finally {
    applyPopupState({ isOrganising: false });
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
  getPopupElement('autoPrepareButton')?.addEventListener('click', requestAutoPrepare);
  getPopupElement('stopAutoPreparationButton')?.addEventListener('click', requestStopAutoPreparation);
  const organiseButton = getPopupElement('organiseButton');
  if (organiseButton) {
    organiseButton.addEventListener('click', requestOrganise);
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
  setStateMessage('Loading YouTube video tabs…');

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
