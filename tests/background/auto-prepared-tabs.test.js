import assert from 'node:assert/strict';
import test from 'node:test';
import {
  saveAutoPreparedTab, removeAutoPreparedTab, readAutoPreparedTabs, restoreAutoPreparedTab,
} from '../../background/auto-preparation/auto-prepared-tabs.js';

test('saved auto-preparation survives record loss but cannot be reused for awake or different videos', async () => {
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
  assert.equal(await saveAutoPreparedTab(record), true);
  record.videoDetails.remainingSeconds = null;
  const saved = await readAutoPreparedTabs();
  assert.equal(restoreAutoPreparedTab(tab, {}, saved).videoDetails.remainingSeconds, 25);
  assert.deepEqual(restoreAutoPreparedTab({ ...tab, discarded: false }, {}, saved), {});
  assert.deepEqual(restoreAutoPreparedTab({ ...tab, url: 'https://www.youtube.com/watch?v=other' }, {}, saved), {});
  await removeAutoPreparedTab(tab.id);
  assert.deepEqual(restoreAutoPreparedTab(tab, {}, await readAutoPreparedTabs()), {});
});
