import { getCurrentTimeMs } from './window-store.js';
import {
  markRecordVideoElementReady,
  resetVideoReadiness,
} from './tab-record-lifecycle.js';

export function applyPlaybackMetricUpdate(record, playbackUpdate, currentTabUrl) {
  if (!record || !playbackUpdate) return;

  record.contentScriptReady = playbackUpdate.contentScriptReady;
  if (playbackUpdate.videoElementReady) {
    markRecordVideoElementReady(record);
  } else {
    resetVideoReadiness(record, { videoWaitStartedAt: record.videoWaitStartedAt });
    if (record.contentScriptReady && typeof record.videoWaitStartedAt !== 'number') {
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
  record.remainingTimeNeedsRefresh = playbackUpdate.remainingTimeNeedsRefresh;
}
