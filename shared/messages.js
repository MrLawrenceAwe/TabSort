export const RUNTIME_MESSAGE_TYPES = Object.freeze({
  OPEN_TAB: 'openTab',
  COLLECT_VIDEO_METRICS: 'collectVideoMetrics',
  GET_TAB_SNAPSHOT: 'getTabSnapshot',
  LOG_POPUP_MESSAGE: 'logPopupMessage',
  PLAYBACK_METRICS_READY: 'playbackMetricsReady',
  CONTENT_SCRIPT_READY: 'contentScriptReady',
  PAGE_VIDEO_DETAILS: 'pageVideoDetails',
  PING: 'ping',
  RELOAD_TAB: 'reloadTab',
  ORGANISE_TABS: 'organiseTabs',
  SYNC_TRACKED_TABS: 'syncTrackedTabs',
  TAB_SNAPSHOT_UPDATED: 'tabSnapshotUpdated',
});

export function createRuntimeMessage(type, data = {}) {
  return { type, ...data };
}
