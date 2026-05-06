import { TAB_STATES } from '../../shared/tab-states.js';
import { createEmptySortSummary } from '../../shared/sort-summary-model.js';
import {
  applySortState,
  resetTrackedWindowState as resetBackgroundTrackedWindowState,
} from '../../background/tracked-window-state.js';
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
  resetBackgroundTrackedWindowState({ windowId });
  applySortState({ sortSummary: createEmptySortSummary() });
}

export function makeTabRecord(id = 1, overrides = {}) {
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
    isRemainingTimeStale: true,
    ...overrides,
  });
}
