export const RUNTIME_MESSAGE_TYPES = Object.freeze({
  ACTIVATE_TAB: 'activateTab',
  COLLECT_VIDEO_METRICS: 'collectVideoMetrics',
  GET_TAB_SNAPSHOT: 'getTabSnapshot',
  LOG_POPUP_MESSAGE: 'logPopupMessage',
  PLAYBACK_METRICS_READY: 'playbackMetricsReady',
  CONTENT_SCRIPT_READY: 'contentScriptReady',
  PAGE_VIDEO_DETAILS: 'pageVideoDetails',
  PING: 'ping',
  RELOAD_TAB: 'reloadTab',
  START_AUTO_PREPARATION: 'startAutoPreparation',
  STOP_AUTO_PREPARATION: 'stopAutoPreparation',
  GET_AUTO_PREPARATION: 'getAutoPreparation',
  AUTO_PREPARATION_UPDATED: 'autoPreparationUpdated',
  ORGANISE_TABS: 'organiseTabs',
  TAB_SNAPSHOT_UPDATED: 'tabSnapshotUpdated',
});

export function createRuntimeMessage(type, data = {}) {
  return { type, ...data };
}
