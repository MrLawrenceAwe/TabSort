import { createSortSummary } from '../../shared/sorting/summary.js';
import { isValidWindowId } from '../../shared/guards.js';

function cloneTabRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    videoDetails: record.videoDetails ? { ...record.videoDetails } : null,
  };
}

function cloneTabRecordsById(tabRecordsById = {}) {
  return Object.fromEntries(
    Object.entries(tabRecordsById).map(([id, record]) => [id, cloneTabRecord(record)]),
  );
}

function createTrackedWindowStoreState() {
  return {
    tabRecordsById: {},
    orderedWindowTabs: [],
    targetVideoTabOrder: [],
    trackedTabOrder: [],
    isTargetOrderApplied: false,
    sortSummary: createSortSummary(),
    windowId: null,
    snapshotSignature: null,
    syncToken: 0,
  };
}

const trackedWindowState = createTrackedWindowStoreState();

export const trackedWindow = Object.freeze({
  get tabRecordsById() {
    return cloneTabRecordsById(trackedWindowState.tabRecordsById);
  },
  get targetVideoTabOrder() {
    return [...trackedWindowState.targetVideoTabOrder];
  },
  get trackedTabOrder() {
    return [...trackedWindowState.trackedTabOrder];
  },
  get isTargetOrderApplied() {
    return trackedWindowState.isTargetOrderApplied;
  },
  get sortSummary() {
    return createSortSummary(trackedWindowState.sortSummary);
  },
  get windowId() {
    return trackedWindowState.windowId;
  },
  get snapshotSignature() {
    return trackedWindowState.snapshotSignature;
  },
  get syncToken() {
    return trackedWindowState.syncToken;
  },
});

export function getTrackedWindowId() {
  return isValidWindowId(trackedWindowState.windowId) ? trackedWindowState.windowId : null;
}

export function getTabRecord(tabId) {
  return cloneTabRecord(trackedWindowState.tabRecordsById[tabId] || null);
}

export function getTabRecordsById() {
  return cloneTabRecordsById(trackedWindowState.tabRecordsById);
}

export function listTabRecords() {
  return Object.values(getTabRecordsById());
}

export function listTabIds() {
  return Object.keys(trackedWindowState.tabRecordsById).map(Number);
}

export function getOrderedWindowTabs() {
  return trackedWindowState.orderedWindowTabs.map((tab) => ({ ...tab }));
}

export function replaceOrderedWindowTabs(tabs = []) {
  trackedWindowState.orderedWindowTabs = tabs
    .filter((tab) => tab && typeof tab.id === 'number')
    .map((tab) => ({
      id: tab.id,
      index: tab.index,
      pinned: Boolean(tab.pinned),
      url: tab.url ?? null,
    }))
    .sort((left, right) => left.index - right.index);
  return getOrderedWindowTabs();
}

export function deleteTabFromOrderedWindow(tabId) {
  const previousLength = trackedWindowState.orderedWindowTabs.length;
  trackedWindowState.orderedWindowTabs = trackedWindowState.orderedWindowTabs.filter(
    (tab) => tab.id !== tabId,
  );
  return trackedWindowState.orderedWindowTabs.length !== previousLength;
}

export function canManageWindow(windowId) {
  return trackedWindowState.windowId == null || windowId === trackedWindowState.windowId;
}

export function resetTrackedWindowStore({ windowId = null } = {}) {
  const nextState = createTrackedWindowStoreState();
  nextState.windowId = isValidWindowId(windowId) ? windowId : null;
  Object.assign(trackedWindowState, nextState);
  return trackedWindow;
}

export function replaceAllTabRecords(tabRecordsById = {}) {
  trackedWindowState.tabRecordsById = { ...tabRecordsById };
  return trackedWindowState.tabRecordsById;
}

export function getMutableTabRecord(tabId) {
  return trackedWindowState.tabRecordsById[tabId] || null;
}

export function setTabRecord(tabId, record) {
  if (typeof tabId !== 'number' || !record) return null;
  trackedWindowState.tabRecordsById[tabId] = record;
  return trackedWindowState.tabRecordsById[tabId];
}

export function deleteTabRecord(tabId) {
  if (!trackedWindowState.tabRecordsById[tabId]) return false;
  delete trackedWindowState.tabRecordsById[tabId];
  return true;
}

export function setSnapshotSignature(signature = null) {
  trackedWindowState.snapshotSignature = signature;
  return trackedWindowState.snapshotSignature;
}

export function nextSyncToken() {
  trackedWindowState.syncToken += 1;
  return trackedWindowState.syncToken;
}

export function isSyncTokenCurrent(syncToken) {
  return syncToken === trackedWindowState.syncToken;
}

export function setSortState({
  trackedTabOrder = [],
  targetVideoTabOrder = [],
  isTargetOrderApplied = false,
  sortSummary = createSortSummary(),
} = {}) {
  trackedWindowState.targetVideoTabOrder = [...targetVideoTabOrder];
  trackedWindowState.trackedTabOrder = [...trackedTabOrder];
  trackedWindowState.isTargetOrderApplied = Boolean(isTargetOrderApplied);
  trackedWindowState.sortSummary = createSortSummary(sortSummary);
}

export function setTrackedWindowId(windowId, { force = false } = {}) {
  if (isValidWindowId(windowId)) {
    if (force || !isValidWindowId(trackedWindowState.windowId)) {
      trackedWindowState.windowId = windowId;
    }
  } else if (force && windowId == null) {
    trackedWindowState.windowId = null;
  }
  return getTrackedWindowId();
}
