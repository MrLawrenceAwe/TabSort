import { TAB_STATES } from '../../shared/constants.js';
import { backgroundStore } from '../../background/store.js';

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

export function resetBackgroundStore(trackedWindowId = null) {
  backgroundStore.trackedTabsById = {};
  backgroundStore.targetOrder = [];
  backgroundStore.visibleOrder = [];
  backgroundStore.tabsSorted = false;
  backgroundStore.readiness = null;
  backgroundStore.trackedWindowId = trackedWindowId;
  backgroundStore.snapshotSignature = null;
  backgroundStore.syncToken = 0;
}

export function makeTrackedTabRecord(id = 1, overrides = {}) {
  return {
    id,
    windowId: 1,
    url: `https://www.youtube.com/watch?v=${id}`,
    index: 0,
    pinned: false,
    status: TAB_STATES.UNSUSPENDED,
    pageRuntimeReady: true,
    isLiveStream: false,
    isActiveTab: false,
    isHidden: false,
    videoDetails: { title: `Video ${id}`, remainingTime: null, lengthSeconds: null },
    loadingStartedAt: null,
    unsuspendedTimestamp: null,
    isRemainingTimeStale: true,
    ...overrides,
  };
}
