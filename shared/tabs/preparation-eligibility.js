import { hasReadyRemainingTime } from './sort-readiness.js';

// Input records represent tracked YouTube videos in the browsing window.
export function isPreparationCandidate(record) {
  return Boolean(record) && !record.pinned && !record.isLive && !record.isActive &&
    !record.autoPreparationInProgress && !hasReadyRemainingTime(record);
}
