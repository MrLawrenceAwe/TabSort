export const RUNTIME_MESSAGE_TYPES = Object.freeze({
  ACTIVATE_TAB: 'activateTab',
  COLLECT_VIDEO_METRICS: 'collectVideoMetrics',
  GET_TAB_SNAPSHOT: 'getTabSnapshot',
  LOG_POPUP_MESSAGE: 'logPopupMessage',
  PAGE_MEDIA_READY: 'pageMediaReady',
  PAGE_RUNTIME_READY: 'pageRuntimeReady',
  PAGE_VIDEO_DETAILS: 'pageVideoDetails',
  PING: 'ping',
  RELOAD_TAB: 'reloadTab',
  SORT_WINDOW_TABS: 'sortWindowTabs',
  SYNC_TRACKED_TABS: 'syncTrackedTabs',
  TAB_SNAPSHOT_UPDATED: 'tabSnapshotUpdated',
});

export function createRuntimeMessage(type, data = {}) {
  return { type, ...data };
}
