import { shouldPollRecord } from '../shared/tab-refresh-policy.js';

export function shouldPollTabSnapshot(snapshot, { now = Date.now } = {}) {
  const tabRecordsById = snapshot?.tabRecordsById;
  if (!tabRecordsById || typeof tabRecordsById !== 'object') return false;
  return Object.values(tabRecordsById).some((record) => shouldPollRecord(record, { now }));
}

export function shouldRetryTabRefresh(snapshot, appActive) {
  return Boolean(appActive) && snapshot == null;
}

export function createTabRefreshPoller({
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
          shouldRetryTabRefresh(snapshot, isAppActive()) ||
          (isAppActive() && shouldPollTabSnapshot(snapshot))
        ) {
          schedule();
        }
      }
    }, delayMs);
  }

  function scheduleIfNeeded(snapshot) {
    clear();
    if (isAppActive() && shouldPollTabSnapshot(snapshot)) {
      schedule();
    }
  }

  return {
    clear,
    scheduleIfNeeded,
    schedule,
  };
}
