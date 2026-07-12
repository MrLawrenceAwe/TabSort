export const RUNTIME_MESSAGE_TYPES = Object.freeze({
  OPEN_TAB: 'openTab',
  COLLECT_VIDEO_METRICS: 'collectVideoMetrics',
  GET_TAB_SNAPSHOT: 'getTabSnapshot',
  LOG_POPUP_MESSAGE: 'logPopupMessage',
  VIDEO_ELEMENT_READY: 'videoElementReady',
  CONTENT_SCRIPT_READY: 'contentScriptReady',
  PAGE_VIDEO_DETAILS: 'pageVideoDetails',
  PING: 'ping',
  RELOAD_TAB: 'reloadTab',
  SORT_TABS: 'sortTabs',
  SYNC_TRACKED_TABS: 'syncTrackedTabs',
  TAB_SNAPSHOT_UPDATED: 'tabSnapshotUpdated',
});

export function createRuntimeMessage(type, data = {}) {
  return { type, ...data };
}
