import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreparationServiceFixture } from '../helpers/preparation-service-fixture.js';
import { getAutoPreparation } from '../../background/auto-preparation/state.js';
import { getMutableTabRecord } from '../../background/windows/tracked-window-store.js';

test('the attempt deadline cancels stalled initialization or collection and rejects late data', { timeout: 2000 }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  // Import after installing the clock so the runner captures the mocked Date.now.
  const { startAutoPreparation, stopAutoPreparation } = await import(
    '../../background/auto-preparation/service.js'
  );
  for (const stalledOperation of ['start', 'metrics']) {
    const h = createPreparationServiceFixture(1);
    let enteredOperation;
    const entered = new Promise(resolve => { enteredOperation = resolve; });
    let releaseOperation;
    const operations = [];
    let reloads = 0;
    chrome.tabs.reload = async id => {
      reloads++;
      // Navigation during retry ends the run without another preparation attempt.
      h.tabs.get(id).url = 'https://example.com';
    };
    chrome.scripting.executeScript = async ({ args }) => {
      const operation = args[2];
      operations.push(operation);
      if (operation === 'start') t.mock.timers.tick(59900);
      if (operation === stalledOperation) {
        enteredOperation();
        return new Promise(resolve => { releaseOperation = resolve; });
      }
      return [{ result: true }];
    };
    assert.equal((await startAutoPreparation({ windowId: 1 })).ok, true);
    await entered;
    try {
      t.mock.timers.tick(100);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(reloads, 1, 'Retry starts when the remaining 100 ms expires');
      assert.equal(getAutoPreparation().status, 'complete');
      assert.equal(getAutoPreparation().skipped, 1);
      assert.equal(operations.filter(operation => operation === 'metrics').length,
        stalledOperation === 'metrics' ? 1 : 0);
      const before = structuredClone(getMutableTabRecord(1));
      releaseOperation([{ result: stalledOperation === 'start' ? true : {
        url: 'https://www.youtube.com/watch?v=1', playbackMetricsReady: true,
        metadataDurationSeconds: 60, mediaDurationSeconds: 60, positionSeconds: 20,
      } }]);
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(getMutableTabRecord(1), before);
      assert.equal(getAutoPreparation().ready, 0);
    } finally {
      await stopAutoPreparation();
      releaseOperation([{ result: null }]);
    }
  }
});
