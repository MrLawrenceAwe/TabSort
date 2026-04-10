import { TAB_STATES } from '../shared/constants.js';
import { determineUserAction, USER_ACTIONS } from './tab-action-policy.js';

export function shouldAutoRefreshRecord(record) {
  if (!record || record.isLiveStream) return false;

  const userAction = determineUserAction(record);
  if (
    record.status === TAB_STATES.UNSUSPENDED &&
    record.isRemainingTimeStale &&
    userAction === USER_ACTIONS.NO_ACTION
  ) {
    return true;
  }

  return record.status === TAB_STATES.LOADING && userAction === USER_ACTIONS.WAIT_FOR_LOAD;
}

export function shouldAutoRefreshSnapshot(snapshot) {
  const trackedTabsById = snapshot?.trackedTabsById;
  if (!trackedTabsById || typeof trackedTabsById !== 'object') return false;
  return Object.values(trackedTabsById).some((record) => shouldAutoRefreshRecord(record));
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
          (isControllerActive() && shouldAutoRefreshSnapshot(snapshot))
        ) {
          schedule();
        }
      }
    }, delayMs);
  }

  function refreshIfNeeded(snapshot) {
    clear();
    if (isControllerActive() && shouldAutoRefreshSnapshot(snapshot)) {
      schedule();
    }
  }

  return {
    clear,
    refreshIfNeeded,
    schedule,
  };
}
