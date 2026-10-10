import { shouldPollRecord } from '../shared/tabs/refresh-policy.js';

export function shouldPollSnapshot(snapshot, { now = Date.now } = {}) {
  if (snapshot?.autoPreparation?.status === 'running') return false;
  const tabRecordsById = snapshot?.tabRecordsById;
  if (!tabRecordsById || typeof tabRecordsById !== 'object') return false;
  return Object.values(tabRecordsById).some((record) => shouldPollRecord(record, { now }));
}

export function shouldRetrySnapshotLoad(snapshot, popupOpen) {
  return Boolean(popupOpen) && snapshot == null;
}

export function createSnapshotPoller({
  delayMs,
  isPopupOpen,
  loadSnapshot,
  logPopupError,
  onSnapshot,
} = {}) {
  let timeoutId = null;
  let pollInFlight = false;
  let paused = false;
  let generation = 0;
  let latestSnapshot = null;

  function clearTimer() {
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  function schedule() {
    if (paused || !isPopupOpen() || timeoutId != null || pollInFlight) return;
    if (!shouldRetrySnapshotLoad(latestSnapshot, true) && !shouldPollSnapshot(latestSnapshot)) return;
    timeoutId = setTimeout(async () => {
      timeoutId = null;
      pollInFlight = true;
      const requestGeneration = generation;
      try {
        const snapshot = await loadSnapshot();
        if (requestGeneration !== generation || paused || !isPopupOpen()) return;
        latestSnapshot = snapshot;
        if (snapshot) onSnapshot(snapshot);
      } catch (error) {
        logPopupError('Failed to refresh pending tab snapshot', error);
      } finally {
        pollInFlight = false;
        schedule();
      }
    }, delayMs);
  }

  function scheduleIfNeeded(snapshot) {
    latestSnapshot = snapshot;
    generation += 1;
    clearTimer();
    schedule();
  }

  function setPaused(value) {
    paused = value;
    generation += 1;
    clearTimer();
    schedule();
  }

  return { setPaused, scheduleIfNeeded };
}
