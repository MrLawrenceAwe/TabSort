import { TAB_STATES } from '../../shared/constants.js';
import { isFiniteNumber, isValidWindowId } from '../../shared/guards.js';
import { backgroundStore, now, setTrackedWindowIdIfNeeded } from '../background-store.js';
import { recomputeSortState } from '../sort-state.js';

export async function activateTab(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) return;
  if (isValidWindowId(message.windowId)) {
    setTrackedWindowIdIfNeeded(message.windowId, { force: true });
  }
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch (_) {}
}

export async function reloadTab(message) {
  const tabId = message.tabId;
  if (!isFiniteNumber(tabId)) return;
  if (isValidWindowId(message.windowId)) {
    setTrackedWindowIdIfNeeded(message.windowId, { force: true });
  }
  let reloadSucceeded = false;
  try {
    await chrome.tabs.reload(tabId);
    reloadSucceeded = true;
  } catch (_) {}
  if (!reloadSucceeded) return;
  const record = backgroundStore.trackedVideoTabsById[tabId];
  if (record) {
    record.status = TAB_STATES.LOADING;
    record.loadingStartedAt = now();
    record.unsuspendedTimestamp = now();
    record.pageRuntimeReady = false;
    record.isRemainingTimeStale = true;
    if (record.videoDetails && record.videoDetails.remainingTime != null) {
      record.videoDetails.remainingTime = null;
    }
    recomputeSortState();
  }
}
