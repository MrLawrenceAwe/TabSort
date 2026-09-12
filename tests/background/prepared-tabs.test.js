import assert from 'node:assert/strict';
import test from 'node:test';
import {
  savePreparedTab, removePreparedTab, readPreparedTabs, restorePreparedTab,
} from '../../background/preparation/prepared-tabs.js';

test('saved preparation survives record loss but cannot be reused for awake or different videos', async () => {
  const storage = {};
  globalThis.chrome = { storage: { session: {
    set: async values => Object.assign(storage, values),
    get: async () => ({ ...storage }),
    remove: async key => { delete storage[key]; },
  } } };
  const tab = { id: 42, discarded: true, url: 'https://www.youtube.com/watch?v=saved' };
  const record = {
    ...tab, remainingSecondsStale: false,
    videoDetails: { title: 'Watched partly', remainingSeconds: 25, lengthSeconds: 100 },
  };
  assert.equal(await savePreparedTab(record), true);
  record.videoDetails.remainingSeconds = null;
  const saved = await readPreparedTabs();
  assert.equal(restorePreparedTab(tab, {}, saved).videoDetails.remainingSeconds, 25);
  assert.deepEqual(restorePreparedTab({ ...tab, discarded: false }, {}, saved), {});
  assert.deepEqual(restorePreparedTab({ ...tab, url: 'https://www.youtube.com/watch?v=other' }, {}, saved), {});
  await removePreparedTab(tab.id);
  assert.deepEqual(restorePreparedTab(tab, {}, await readPreparedTabs()), {});
});
