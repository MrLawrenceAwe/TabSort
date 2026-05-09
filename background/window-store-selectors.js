import { isValidWindowId } from '../shared/guards.js';
import { trackedWindowStoreState } from './window-store.js';

export function getTrackedWindowId() {
  return isValidWindowId(trackedWindowStoreState.windowId) ? trackedWindowStoreState.windowId : null;
}

export function getTabRecord(tabId) {
  return trackedWindowStoreState.tabRecordsById[tabId] || null;
}

export function getTabRecordsById() {
  return trackedWindowStoreState.tabRecordsById;
}

export function listTabRecords() {
  return Object.values(trackedWindowStoreState.tabRecordsById);
}

export function listTabIds() {
  return Object.keys(trackedWindowStoreState.tabRecordsById).map(Number);
}

export function canManageWindow(windowId) {
  return trackedWindowStoreState.windowId == null || windowId === trackedWindowStoreState.windowId;
}
