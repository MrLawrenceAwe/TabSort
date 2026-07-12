import { TAB_LOAD_STATES } from '../../shared/tabs/load-states.js';
import { createSortSummary } from '../../shared/sorting/summary.js';
import {
  trackedWindow,
  resetTrackedWindowStore,
  replaceAllTabRecords,
  setSortState,
  setTabRecord,
} from '../../background/windows/store.js';
import { createTabRecord } from '../../background/tabs/record.js';

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

export function createPlaybackMetricsFixture({
  tabId = 1,
  title = `Video ${tabId}`,
  url = `https://www.youtube.com/watch?v=${tabId}`,
  videoElementReady = true,
  lengthSeconds = 120,
  currentTime = 20,
  playbackRate = 1,
  paused = false,
  isLive = false,
  ...overrides
} = {}) {
  return {
    title,
    url,
    videoElementReady,
    lengthSeconds,
    currentTime,
    playbackRate,
    paused,
    isLive,
    ...overrides,
  };
}

export function createChromeTabGetFixture({
  tabId = 1,
  windowId = 1,
  url = `https://www.youtube.com/watch?v=${tabId}`,
  active = false,
  hidden = false,
} = {}) {
  return { id: tabId, windowId, url, active, hidden };
}

export function stubChromeTabGetSequence(tabs, { async = false } = {}) {
  const responses = tabs.map((tab) => createChromeTabGetFixture(tab));
  let nextIndex = 0;
  globalThis.chrome.tabs.get = (_tabId, callback) => {
    const response = responses[Math.min(nextIndex, responses.length - 1)];
    nextIndex += 1;
    if (async) {
      setTimeout(() => callback(response), 0);
      return;
    }
    callback(response);
  };
}

export function stubChromeTabMetricPayload(payload, { async = false } = {}) {
  globalThis.chrome.tabs.sendMessage = (_tabId, _payload, callback) => {
    if (async) {
      setTimeout(() => callback(payload), 0);
      return;
    }
    callback(payload);
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
    callback(createPlaybackMetricsFixture({
      tabId,
      title: 'Archived Stream',
      url,
      videoElementReady: false,
      lengthSeconds: null,
      duration: 6211,
      currentTime: 0,
      playbackRate: 1,
      paused: true,
      isLive: false,
      ...metrics,
    }));
  };
}

export function resetTrackedWindowState(windowId = null) {
  resetTrackedWindowStore({ windowId });
  setSortState({ sortSummary: createSortSummary() });
}

export function setTrackedTabRecords(tabRecordsById = {}) {
  return replaceAllTabRecords(tabRecordsById);
}

export function setTrackedSortState(sortState = {}) {
  setSortState({
    trackedTabIdsInWindowOrder: trackedWindow.trackedTabIdsInWindowOrder,
    plannedVideoTabOrder: trackedWindow.plannedVideoTabOrder,
    isSortComplete: trackedWindow.isSortComplete,
    sortSummary: trackedWindow.sortSummary || createSortSummary(),
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
    loadState: TAB_LOAD_STATES.UNSUSPENDED,
    pageRuntimeReady: true,
    videoElementReady: true,
    isLive: false,
    isActive: false,
    isHidden: false,
    videoDetails: { title: `Video ${id}`, remainingTime: null, lengthSeconds: null },
    loadingStartedAt: null,
    unsuspendedTimestamp: null,
    transitionStartedAt: null,
    waitingForVideoSince: null,
    remainingTimeStale: true,
    ...overrides,
  });
}
