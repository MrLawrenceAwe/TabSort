import { isValidWindowId } from '../shared/guards.js';
import { cloneTabRecord, cloneTabRecordsById, mutableTrackedWindowState } from './window-store.js';

export function getTrackedWindowId() {
  return isValidWindowId(mutableTrackedWindowState.windowId) ? mutableTrackedWindowState.windowId : null;
}

export function getTabRecord(tabId) {
  return cloneTabRecord(mutableTrackedWindowState.tabRecordsById[tabId] || null);
}

export function getTabRecordsById() {
  return cloneTabRecordsById(mutableTrackedWindowState.tabRecordsById);
}

export function listTabRecords() {
  return Object.values(getTabRecordsById());
}

export function listTabIds() {
  return Object.keys(mutableTrackedWindowState.tabRecordsById).map(Number);
}

export function canManageWindow(windowId) {
  return mutableTrackedWindowState.windowId == null || windowId === mutableTrackedWindowState.windowId;
}
