import { MEDIA_DURATION_SYNC_TOLERANCE_SECONDS } from '../../../shared/playback/constants.js';

const DEFAULT_MEDIA_READY_STATE_THRESHOLD = 2;

export const DEFAULT_PAGE_CONFIG = {
  mediaReadyStateThreshold: DEFAULT_MEDIA_READY_STATE_THRESHOLD,
  mediaDurationSyncToleranceSeconds: MEDIA_DURATION_SYNC_TOLERANCE_SECONDS,
};
