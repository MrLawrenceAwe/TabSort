import assert from 'node:assert/strict';
import test from 'node:test';
import {
  saveAutoPreparedTab, removeAutoPreparedTab, readAutoPreparedTabs, restoreAutoPreparedTab,
  transferAutoPreparedTab,
} from '../../background/auto-preparation/session-cache.js';
import { reconcileTabRecord } from '../../background/tabs/reconcile-tab-record.js';
import { hasReadyRemainingTime } from '../../shared/tabs/sort-readiness.js';
import { applyTabReloadStarted } from '../../background/tabs/video-state.js';

test('a reading collected during pending page requests remains ready until a new navigation starts', async () => {
  const storage = {};
  globalThis.chrome = { storage: { session: {
    set: async values => Object.assign(storage, values),
    get: async () => structuredClone(storage),
  } } };
  const tab = { id: 42, windowId: 1, url: 'https://www.youtube.com/watch?v=pending', status: 'loading', discarded: false };
  await saveAutoPreparedTab({ ...tab, remainingSecondsStale: false,
    videoDetails: { remainingSeconds: 25 } }, { discarded: false, loading: true });
  const saved = await readAutoPreparedTabs();
  const restored = restoreAutoPreparedTab(tab, reconcileTabRecord(tab, {}, 'loading'), saved);
  assert.equal(hasReadyRemainingTime(restored), true);
  const pending = reconcileTabRecord(tab, restored, 'loading');
  assert.equal(hasReadyRemainingTime(pending), true);
  assert.equal(hasReadyRemainingTime(reconcileTabRecord({ ...tab, status: 'complete' }, pending, 'loaded')), true);
  applyTabReloadStarted(pending);
  assert.equal(hasReadyRemainingTime(reconcileTabRecord(tab, pending, 'loading')), false);
});

test('sleeping snapshots survive record loss but do not restore into awake tabs or different videos', async () => {
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

test('reads current session readings without writes and transfers replaced tab IDs', async () => {
  const tab = { id: 42, discarded: true, url: 'https://www.youtube.com/watch?v=saved' };
  const journal = { windowId: 9, transfer: { tabId: 42, placeholderId: 43 } };
  const storage = {
    autoPreparationWorkspace: journal,
    'autoPreparedTab:3': null,
    'autoPreparedTab:42': {
      videoId: 'saved', discarded: true,
      videoDetails: { title: 'Saved video', remainingSeconds: 25, durationSeconds: 100 },
    },
    'autoPreparedTab:7': {
      videoId: 'current', discarded: false,
      videoDetails: { remainingSeconds: 10, durationSeconds: 80 },
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
  assert.equal(saved['autoPreparedTab:3'], undefined);
  assert.deepEqual(await readAutoPreparedTabs(), saved);
  assert.equal(writes, 0);

  await transferAutoPreparedTab(99, 42);
  assert.equal(storage['autoPreparedTab:42'], undefined);
  assert.deepEqual(storage['autoPreparedTab:99'], saved['autoPreparedTab:42']);
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
