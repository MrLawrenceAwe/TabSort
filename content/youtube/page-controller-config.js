import { isFiniteNumber } from '../../shared/guards.js';
import { MEDIA_DURATION_SYNC_TOLERANCE_SECONDS } from '../../shared/video-duration.js';
import { inferIsLiveNow } from './live-status.js';

const DEFAULT_MEDIA_READY_STATE_THRESHOLD = 2;

export const DEFAULT_PAGE_CONTROLLER_CONFIG = {
  mediaReadyStateThreshold: DEFAULT_MEDIA_READY_STATE_THRESHOLD,
  mediaDurationSyncToleranceSeconds: MEDIA_DURATION_SYNC_TOLERANCE_SECONDS,
};

export const PAGE_CONTROLLER_DEPENDENCIES = {
  isFiniteNumber,
  inferIsLiveNow,
};
