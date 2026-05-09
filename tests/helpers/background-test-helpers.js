import { TAB_STATES } from '../../shared/tab-states.js';
import { createEmptySortSummary } from '../../shared/sort-summary.js';
import { trackedWindowState } from '../../background/window-store.js';
import {
  resetWindowStore,
  replaceAllTabRecords,
  setSortState,
  setTabRecord,
} from '../../background/window-store-mutations.js';
import { createTabRecord } from '../../background/tab-record.js';

export function ensureChromeApi({ tabs = false } = {}) {
  if (!globalThis.chrome) {
    globalThis.chrome = {};
  }
  if (!globalThis.chrome.runtime) {
    globalThis.chrome.runtime = {};
  }
  if (tabs && !globalThis.chrome.tabs) {
    globalThis.chrome.tabs = {};
  }

  globalThis.chrome.runtime.lastError = null;
  globalThis.chrome.runtime.sendMessage = (_message, callback) => {
    if (typeof callback === 'function') callback();
  };
}

export function resetTrackedWindowState(windowId = null) {
  resetWindowStore({ windowId });
  setSortState({ sortSummary: createEmptySortSummary() });
}

export function setTrackedTabRecords(tabRecordsById = {}) {
  return replaceAllTabRecords(tabRecordsById);
}

export function setTrackedSortState(sortState = {}) {
  setSortState({
    visibleTabIds: trackedWindowState.visibleTabIds,
    targetSortableTabIds: trackedWindowState.targetSortableTabIds,
    currentOrderMatchesTarget: trackedWindowState.currentOrderMatchesTarget,
    sortSummary: trackedWindowState.sortSummary || createEmptySortSummary(),
    ...sortState,
  });
}

export function setTrackedTabRecord(tabId, record) {
  return setTabRecord(tabId, record);
}

export function createTabRecordFixture(id = 1, overrides = {}) {
  return createTabRecord(id, 1, {
    url: `https://www.youtube.com/watch?v=${id}`,
    index: 0,
    pinned: false,
    status: TAB_STATES.UNSUSPENDED,
    pageRuntimeReady: true,
    pageMediaReady: true,
    isLiveNow: false,
    isActiveTab: false,
    isHidden: false,
    videoDetails: { title: `Video ${id}`, remainingTime: null, lengthSeconds: null },
    loadingStartedAt: null,
    unsuspendedTimestamp: null,
    transitionStartedAt: null,
    mediaWaitStartedAt: null,
    isRemainingTimeStale: true,
    ...overrides,
  });
}
