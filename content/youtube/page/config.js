import { isFiniteNumber } from '../../../shared/guards.js';
import { MEDIA_DURATION_SYNC_TOLERANCE_SECONDS } from '../../../shared/playback/constants.js';
import { inferIsLiveNow } from '../metadata/live-status.js';

const DEFAULT_MEDIA_READY_STATE_THRESHOLD = 2;

export const DEFAULT_PAGE_CONFIG = {
  mediaReadyStateThreshold: DEFAULT_MEDIA_READY_STATE_THRESHOLD,
  mediaDurationSyncToleranceSeconds: MEDIA_DURATION_SYNC_TOLERANCE_SECONDS,
};

export const DEFAULT_PAGE_DEPENDENCIES = {
  isFiniteNumber,
  inferIsLiveNow,
};
