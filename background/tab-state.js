import { TAB_STATES } from '../shared/constants.js';
import { now } from './store.js';

export function updateLoadStart(record, previousStatus, nextStatus) {
  if (nextStatus === TAB_STATES.LOADING) {
    if (previousStatus !== TAB_STATES.LOADING || typeof record.loadingStartedAt !== 'number') {
      record.loadingStartedAt = now();
    }
    return;
  }

  record.loadingStartedAt = null;
}

export function updateUnsuspendTime(record, previousStatus, nextStatus) {
  if (
    (previousStatus === TAB_STATES.SUSPENDED || previousStatus === TAB_STATES.LOADING) &&
    nextStatus === TAB_STATES.UNSUSPENDED
  ) {
    record.unsuspendedTimestamp = now();
  }
}
