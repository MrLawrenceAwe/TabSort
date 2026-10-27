import { TAB_LOAD_STATES } from '../../shared/tabs/constants.js';
import {
  getSortState,
  setSortState,
} from '../../background/windows/tracked-window-store.js';
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

  globalThis.chrome.runtime.sendMessage = async () => undefined;
}

export function stubChromeTabQuery(tabs = []) {
  globalThis.chrome.tabs.query = async () => tabs;
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
  globalThis.chrome.tabs.query = async () => { throw new Error(message); };
}

export function stubChromeTabGet(tab = createChromeTabFixture()) {
  globalThis.chrome.tabs.get = async () => ({ ...tab });
}

export function createPlaybackMetricsFixture({
  tabId = 1,
  title = `Video ${tabId}`,
  url = `https://www.youtube.com/watch?v=${tabId}`,
  playbackMetricsReady = true,
  metadataDurationSeconds = 120,
  positionSeconds = 20,
  playbackRate = 1,
  isLive = false,
  ...overrides
} = {}) {
  return {
    title,
    url,
    playbackMetricsReady,
    metadataDurationSeconds,
    positionSeconds,
    playbackRate,
    isLive,
    ...overrides,
  };
}

export function stubChromeTabGetSequence(tabs, { async = false } = {}) {
  let nextIndex = 0;
  globalThis.chrome.tabs.get = async () => {
    const response = tabs[Math.min(nextIndex, tabs.length - 1)];
    nextIndex += 1;
    if (async) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return response;
  };
}

export function stubChromeTabMetricPayload(payload, { async = false } = {}) {
  globalThis.chrome.tabs.sendMessage = async () => {
    if (async) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return payload;
  };
}

export function stubArchivedStreamMetrics({
  tabId = 1,
  windowId = 1,
  url = `https://www.youtube.com/watch?v=${tabId}`,
  active = true,
  hidden = false,
  metrics = {},
} = {}) {
  stubChromeTabGet(createChromeTabFixture(tabId, { windowId, url, active, hidden }));

  globalThis.chrome.tabs.sendMessage = async () => createPlaybackMetricsFixture({
      tabId,
      title: 'Archived Stream',
      url,
      playbackMetricsReady: true,
      metadataDurationSeconds: null,
      mediaDurationSeconds: 6211,
      positionSeconds: 0,
      playbackRate: 1,
      isLive: false,
      ...metrics,
    });
}

export function setTrackedSortState(sortState = {}) {
  setSortState({ ...getSortState(), ...sortState });
}

export function createTabRecordFixture(id = 1, overrides = {}) {
  return createTabRecord(id, 1, {
    url: `https://www.youtube.com/watch?v=${id}`,
    index: 0,
    pinned: false,
    loadState: TAB_LOAD_STATES.LOADED,
    contentScriptReady: true,
    playbackMetricsReady: true,
    isLive: false,
    isActive: false,
    isHidden: false,
    videoDetails: { title: `Video ${id}`, remainingSeconds: null, durationSeconds: null },
    loadingStartedAt: null,
    loadedAt: null,
    transitionStartedAt: null,
    metricsWaitStartedAt: null,
    remainingSecondsStale: true,
    ...overrides,
  });
}
