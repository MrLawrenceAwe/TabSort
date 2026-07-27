import { nowMs } from '../../shared/time.js';
import {
  markPlaybackMetricsReady,
  resetPlaybackReadiness,
} from '../tabs/video-state.js';

export function applyPlaybackStateUpdate(record, playbackUpdate, currentTabUrl) {
  if (!record || !playbackUpdate) return;

  record.contentScriptReady = playbackUpdate.contentScriptReady;
  if (playbackUpdate.playbackMetricsReady) {
    markPlaybackMetricsReady(record);
  } else {
    resetPlaybackReadiness(record, { metricsWaitStartedAt: record.metricsWaitStartedAt });
    if (record.contentScriptReady && typeof record.metricsWaitStartedAt !== 'number') {
      record.metricsWaitStartedAt = nowMs();
    }
  }
  record.videoDetails = record.videoDetails || {};

  if (playbackUpdate.nextTitle || playbackUpdate.nextUrl || currentTabUrl) {
    if (playbackUpdate.nextTitle) record.videoDetails.title = playbackUpdate.nextTitle;
    record.url = playbackUpdate.nextUrl || currentTabUrl;
  }

  record.isLive = Boolean(playbackUpdate.isLive);
  record.videoDetails.lengthSeconds = playbackUpdate.resolvedLengthSeconds;
  record.videoDetails.remainingTime = playbackUpdate.remainingTime;
  record.remainingTimeStale = playbackUpdate.remainingTimeStale;
}
