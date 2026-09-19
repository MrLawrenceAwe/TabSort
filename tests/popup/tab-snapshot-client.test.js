import assert from 'node:assert/strict';
import test from 'node:test';

import { RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { createTabSnapshotClient } from '../../popup/tab-snapshot-client.js';

test('snapshot client retries after refreshing the active window and worker', async () => {
  const requestedTypes = [];
  let snapshotRequests = 0;
  let windowSyncs = 0;
  const client = createTabSnapshotClient({
    requestRuntimeMessage: async (type) => {
      requestedTypes.push(type);
      if (type === RUNTIME_MESSAGE_TYPES.GET_TAB_SNAPSHOT) {
        snapshotRequests += 1;
        return snapshotRequests === 1 ? null : { tabRecordsById: {} };
      }
      return { ok: true };
    },
    syncActiveWindow: async () => { windowSyncs += 1; },
    retryDelayMs: 0,
    maxAttempts: 2,
  });

  assert.deepEqual(await client.loadSnapshot(), { tabRecordsById: {} });
  assert.equal(windowSyncs, 1);
  assert.deepEqual(requestedTypes, [
    RUNTIME_MESSAGE_TYPES.GET_TAB_SNAPSHOT,
    RUNTIME_MESSAGE_TYPES.PING,
    RUNTIME_MESSAGE_TYPES.GET_TAB_SNAPSHOT,
  ]);
});

test('snapshot client exposes its final failure to the controller', async () => {
  const failure = new Error('worker unavailable');
  const client = createTabSnapshotClient({
    requestRuntimeMessage: async () => { throw failure; },
    syncActiveWindow: async () => {},
    retryDelayMs: 0,
    maxAttempts: 1,
  });

  await assert.rejects(client.loadSnapshot(), failure);
});
