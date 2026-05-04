import { TAB_STATES } from '../../shared/constants.js';
import { createEmptySortSummary } from '../../shared/sort-summary.js';
import {
  applyManagedSortState,
  resetManagedState as resetBackgroundManagedState,
} from '../../background/managed-state.js';
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

export function resetManagedState(managedWindowId = null) {
  resetBackgroundManagedState({ managedWindowId });
  applyManagedSortState({ sortSummary: createEmptySortSummary() });
}

export function makeTabRecord(id = 1, overrides = {}) {
  return createTabRecord(id, 1, {
    url: `https://www.youtube.com/watch?v=${id}`,
    index: 0,
    pinned: false,
    status: TAB_STATES.UNSUSPENDED,
    pageRuntimeReady: true,
    pageMediaReady: true,
    isLiveStream: false,
    isActiveTab: false,
    isHidden: false,
    videoDetails: { title: `Video ${id}`, remainingTime: null, lengthSeconds: null },
    loadingStartedAt: null,
    unsuspendedTimestamp: null,
    isRemainingTimeStale: true,
    ...overrides,
  });
}
