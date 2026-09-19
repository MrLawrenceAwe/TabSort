import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isValidSnapshot(snapshot) {
  return snapshot && typeof snapshot === 'object' && 'tabRecordsById' in snapshot;
}

export function createTabSnapshotClient({
  requestRuntimeMessage,
  syncActiveWindow,
  retryDelayMs,
  maxAttempts,
} = {}) {
  async function loadSnapshot() {
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (attempt > 1) {
          await syncActiveWindow().catch(() => {});
          await requestRuntimeMessage(RUNTIME_MESSAGE_TYPES.PING).catch(() => {});
          await sleep(retryDelayMs);
        }
        const response = await requestRuntimeMessage(RUNTIME_MESSAGE_TYPES.GET_TAB_SNAPSHOT, {});
        if (isValidSnapshot(response)) {
          return response;
        }
        lastError = new Error('Invalid snapshot response');
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error('Snapshot request failed');
  }

  return { loadSnapshot };
}
