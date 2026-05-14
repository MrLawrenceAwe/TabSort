import { shouldPollRecord } from '../shared/metrics-refresh-policy.js';

export function shouldPollSnapshot(snapshot, { now = Date.now } = {}) {
  const tabRecordsById = snapshot?.tabRecordsById;
  if (!tabRecordsById || typeof tabRecordsById !== 'object') return false;
  return Object.values(tabRecordsById).some((record) => shouldPollRecord(record, { now }));
}

export function shouldRetrySnapshotLoad(snapshot, appActive) {
  return Boolean(appActive) && snapshot == null;
}

export function createSnapshotPoller({
  delayMs,
  isAppActive,
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
          shouldRetrySnapshotLoad(snapshot, isAppActive()) ||
          (isAppActive() && shouldPollSnapshot(snapshot))
        ) {
          schedule();
        }
      }
    }, delayMs);
  }

  function scheduleIfNeeded(snapshot) {
    clear();
    if (isAppActive() && shouldPollSnapshot(snapshot)) {
      schedule();
    }
  }

  return {
    clear,
    scheduleIfNeeded,
    schedule,
  };
}
