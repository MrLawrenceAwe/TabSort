import { getCurrentTimeMs } from './tracked-window-store.js';
import {
  markVideoElementReady,
  resetVideoReadiness,
} from './tab-video-state.js';

export function applyPlaybackStateUpdate(record, playbackUpdate, currentTabUrl) {
  if (!record || !playbackUpdate) return;

  record.pageRuntimeReady = playbackUpdate.pageRuntimeReady;
  if (playbackUpdate.videoElementReady) {
    markVideoElementReady(record);
  } else {
    resetVideoReadiness(record, { waitingForVideoSince: record.waitingForVideoSince });
    if (record.pageRuntimeReady && typeof record.waitingForVideoSince !== 'number') {
      record.waitingForVideoSince = getCurrentTimeMs();
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
