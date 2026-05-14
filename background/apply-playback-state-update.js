import { getCurrentTimeMs } from './tracked-window-store.js';
import {
  markMediaElementObserved,
  resetVideoMetricsReadiness,
} from './tab-video-state.js';

export function applyPlaybackStateUpdate(record, playbackUpdate, currentTabUrl) {
  if (!record || !playbackUpdate) return;

  record.contentScriptReported = playbackUpdate.contentScriptReported;
  if (playbackUpdate.mediaElementObserved) {
    markMediaElementObserved(record);
  } else {
    resetVideoMetricsReadiness(record, { videoWaitStartedAt: record.videoWaitStartedAt });
    if (record.contentScriptReported && typeof record.videoWaitStartedAt !== 'number') {
      record.videoWaitStartedAt = getCurrentTimeMs();
    }
  }
  record.videoDetails = record.videoDetails || {};

  if (playbackUpdate.nextTitle || playbackUpdate.nextUrl || currentTabUrl) {
    if (playbackUpdate.nextTitle) record.videoDetails.title = playbackUpdate.nextTitle;
    record.url = playbackUpdate.nextUrl || currentTabUrl;
  }

  record.isLiveNow = Boolean(playbackUpdate.isLiveNow);
  record.videoDetails.lengthSeconds = playbackUpdate.resolvedLengthSeconds;
  record.videoDetails.remainingTime = playbackUpdate.remainingTime;
  record.remainingTimeStale = playbackUpdate.remainingTimeStale;
}
