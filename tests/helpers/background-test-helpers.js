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

export function stubChromeTabQuery(tabs = []) {
  globalThis.chrome.tabs.query = (_query, callback) => {
    callback(tabs);
    globalThis.chrome.runtime.lastError = null;
  };
}

export function createChromeTabFixture(id = 1, overrides = {}) {
  return {
    id,
    windowId: 1,
    url: `https://www.youtube.com/watch?v=${id}`,
    index: id - 1,
    pinned: false,
    status: 'complete',
    active: false,
    hidden: false,
    discarded: false,
    ...overrides,
  };
}

export function stubChromeTabQueryFailure(message = 'query failed') {
  globalThis.chrome.tabs.query = (_query, callback) => {
    globalThis.chrome.runtime.lastError = new Error(message);
    callback([]);
    globalThis.chrome.runtime.lastError = null;
  };
}

export function stubChromeTabGet({
  tabId = 1,
  windowId = 1,
  url = `https://www.youtube.com/watch?v=${tabId}`,
  active = false,
  hidden = false,
} = {}) {
  globalThis.chrome.tabs.get = (_tabId, callback) => {
    callback({
      id: tabId,
      windowId,
      url,
      active,
      hidden,
    });
  };
}

export function stubChromeTabMetrics({
  tabId = 1,
  windowId = 1,
  url = `https://www.youtube.com/watch?v=${tabId}`,
  active = true,
  hidden = false,
  metrics = {},
} = {}) {
  stubChromeTabGet({ tabId, windowId, url, active, hidden });

  globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
    callback({
      title: 'Archived Stream',
      url,
      pageMediaReady: false,
      lengthSeconds: null,
      duration: 6211,
      currentTime: 0,
      playbackRate: 1,
      paused: true,
      isLive: false,
      ...metrics,
    });
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
