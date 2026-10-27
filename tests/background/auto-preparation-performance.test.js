import assert from 'node:assert/strict';
import test from 'node:test';
import { startAutoPreparation } from '../../background/auto-preparation/service.js';
import { getAutoPreparation } from '../../background/auto-preparation/state.js';
import { getMutableTabRecord } from '../../background/windows/tracked-window-store.js';
import { RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { createPreparationServiceFixture } from '../helpers/preparation-service-fixture.js';

async function waitForCompletion() {
  for (let i = 0; i < 100 && getAutoPreparation().status === 'running'; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(getAutoPreparation().status, 'complete');
}

test('100 queued tabs that become ready bypass preparation moves and count as ready; progress payloads contain no tab collection', async () => {
  const h = createPreparationServiceFixture(100, () => {
    for (let id = 1; id <= 100; id++) {
      const record = getMutableTabRecord(id);
      record.remainingSecondsStale = false;
      record.videoDetails = { remainingSeconds: 42 };
    }
  });
  assert.equal((await startAutoPreparation({ windowId: 1 })).ok, true);
  await waitForCompletion();
  assert.deepEqual(h.moves, []);
  assert.equal(getAutoPreparation().ready, 100);
  const snapshots = h.messages.filter(message => message.type === RUNTIME_MESSAGE_TYPES.TAB_SNAPSHOT_UPDATED);
  assert.equal(snapshots.length, 1, 'Only startup reconciliation broadcasts the tab collection');
  const progress = h.messages.filter(message => message.type === RUNTIME_MESSAGE_TYPES.AUTO_PREPARATION_UPDATED);
  assert.equal(progress.length, 102);
  assert.ok(progress.every(message => Object.keys(message).sort().join(',') === 'autoPreparation,type'));
  assert.equal(progress.at(-1).autoPreparation.status, 'complete');
});
