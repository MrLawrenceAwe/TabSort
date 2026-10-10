import assert from 'node:assert/strict';
import test from 'node:test';
import {
  saveAutoPreparedTab, removeAutoPreparedTab, readAutoPreparedTabs, restoreAutoPreparedTab,
  transferAutoPreparedTab,
} from '../../background/auto-preparation/session-cache.js';

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
    videoDetails: { title: 'Watched partly', remainingSeconds: 25, durationSeconds: 100 },
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

test('migrates session readings to the current schema without changing the workspace journal', async () => {
  const tab = { id: 42, discarded: true, url: 'https://www.youtube.com/watch?v=saved' };
  const journal = { windowId: 9, transfer: { tabId: 42, placeholderId: 43 } };
  const storage = {
    autoPreparationWorkspace: journal,
    'autoPreparedTab:42': {
      identity: 'saved', discarded: true,
      videoDetails: { title: 'Saved video', remainingSeconds: 25, lengthSeconds: 100 },
    },
    'autoPreparedTab:7': {
      videoId: 'current', identity: 'obsolete', discarded: false,
      videoDetails: { remainingSeconds: 10, durationSeconds: 80, lengthSeconds: 100 },
    },
  };
  let writes = 0;
  globalThis.chrome = { storage: { session: {
    get: async () => structuredClone(storage),
    set: async update => { writes += 1; Object.assign(storage, update); },
    remove: async key => { delete storage[key]; },
  } } };

  const saved = await readAutoPreparedTabs();
  assert.deepEqual(saved['autoPreparedTab:42'], {
    videoId: 'saved', discarded: true,
    videoDetails: { title: 'Saved video', remainingSeconds: 25, durationSeconds: 100 },
  });
  assert.deepEqual(saved['autoPreparedTab:7'], {
    videoId: 'current', discarded: false,
    videoDetails: { remainingSeconds: 10, durationSeconds: 80 },
  });
  assert.equal(restoreAutoPreparedTab(tab, {}, saved).videoDetails.remainingSeconds, 25);
  assert.deepEqual(storage.autoPreparationWorkspace, journal);
  assert.equal(saved.autoPreparationWorkspace, undefined);
  assert.deepEqual(await readAutoPreparedTabs(), saved);
  assert.equal(writes, 1);

  await transferAutoPreparedTab(99, 42);
  assert.equal(storage['autoPreparedTab:42'], undefined);
  assert.deepEqual(storage['autoPreparedTab:99'], saved['autoPreparedTab:42']);
});

test('retains a legacy reading if its migration cannot be saved', async () => {
  const storage = { 'autoPreparedTab:42': { identity: 'saved', discarded: true,
    videoDetails: { remainingSeconds: 25, lengthSeconds: 100 } } };
  const original = structuredClone(storage);
  globalThis.chrome = { storage: { session: {
    get: async () => structuredClone(storage),
    set: async () => { throw new Error('Storage unavailable'); },
  } } };
  await assert.rejects(readAutoPreparedTabs(), /Storage unavailable/);
  assert.deepEqual(storage, original);
});

test('awake snapshots restore only missing data in the same loaded video', async () => {
  const storage = {};
  globalThis.chrome = { storage: { session: {
    set: async values => Object.assign(storage, values),
    get: async () => structuredClone(storage),
    remove: async key => { delete storage[key]; },
  } } };
  const tab = { id: 7, discarded: false, status: 'complete', url: 'https://www.youtube.com/watch?v=awake' };
  await saveAutoPreparedTab({ ...tab, remainingSecondsStale: false,
    videoDetails: { remainingSeconds: 40 } }, { discarded: false });
  const saved = await readAutoPreparedTabs();
  assert.equal(restoreAutoPreparedTab(tab, {}, saved).videoDetails.remainingSeconds, 40);
  for (const changed of [{ status: 'loading' }, { discarded: true }, { url: 'https://www.youtube.com/watch?v=other' }]) {
    assert.deepEqual(restoreAutoPreparedTab({ ...tab, ...changed }, {}, saved), {});
  }
  for (const record of [
    { videoDetails: { remainingSeconds: 15 }, remainingSecondsStale: false },
    { videoDetails: { remainingSeconds: null }, remainingSecondsStale: true },
  ]) assert.equal(restoreAutoPreparedTab(tab, record, saved), record);
  await removeAutoPreparedTab(tab.id);
  assert.deepEqual(restoreAutoPreparedTab(tab, {}, await readAutoPreparedTabs()), {});
});
