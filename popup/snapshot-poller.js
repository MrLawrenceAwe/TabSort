import { TAB_STATES } from '../shared/tab-states.js';
import { determineUserAction, USER_ACTIONS } from './tab-action-policy.js';

export function shouldPollRecord(record, { now = Date.now } = {}) {
  if (!record || record.isLiveStream) return false;

  const userAction = determineUserAction(record, { now });
  if (
    record.status === TAB_STATES.UNSUSPENDED &&
    record.isRemainingTimeStale &&
    userAction === USER_ACTIONS.NONE
  ) {
    return true;
  }

  return record.status === TAB_STATES.LOADING && userAction === USER_ACTIONS.WAIT_FOR_LOAD;
}

export function shouldPollSnapshot(snapshot, { now = Date.now } = {}) {
  const tabRecordsById = snapshot?.tabRecordsById;
  if (!tabRecordsById || typeof tabRecordsById !== 'object') return false;
  return Object.values(tabRecordsById).some((record) => shouldPollRecord(record, { now }));
}

export function shouldRetrySnapshotPoll(snapshot, controllerActive) {
  return Boolean(controllerActive) && snapshot == null;
}

export function createSnapshotPoller({
  delayMs,
  isControllerActive,
  loadSnapshot,
  logPopupError,
  onSnapshot,
} = {}) {
  let timeoutId = null;
  let pollInFlight = false;

  function clear() {
    if (timeoutId == null) return;
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  function schedule() {
    if (timeoutId != null || pollInFlight) return;
    timeoutId = setTimeout(async () => {
      timeoutId = null;
      pollInFlight = true;
      let snapshot = null;
      try {
        snapshot = await loadSnapshot();
        if (snapshot) {
          onSnapshot(snapshot);
        }
      } catch (error) {
        logPopupError('Failed to refresh pending tab snapshot', error);
      } finally {
        pollInFlight = false;
        if (
          shouldRetrySnapshotPoll(snapshot, isControllerActive()) ||
          (isControllerActive() && shouldPollSnapshot(snapshot))
        ) {
          schedule();
        }
      }
    }, delayMs);
  }

  function scheduleIfNeeded(snapshot) {
    clear();
    if (isControllerActive() && shouldPollSnapshot(snapshot)) {
      schedule();
    }
  }

  return {
    clear,
    scheduleIfNeeded,
    schedule,
  };
}
