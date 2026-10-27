import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from '../shared/preferences.js';

function storageFixture(localValues = {}, syncValues = {}) {
  const values = { ...localValues };
  let syncReads = 0;
  globalThis.chrome = { storage: {
    local: {
      get: async keys => Object.fromEntries(keys.filter(key => Object.hasOwn(values, key)).map(key => [key, values[key]])),
      set: async update => Object.assign(values, update),
    },
    sync: {
      get: async keys => {
        syncReads++;
        return Object.fromEntries(keys.filter(key => Object.hasOwn(syncValues, key)).map(key => [key, syncValues[key]]));
      },
      set: async () => { throw new Error('sync quota exceeded'); },
    },
  } };
  return { values, syncReads: () => syncReads };
}

test.afterEach(() => { delete globalThis.chrome; });

test('missing Chrome returns defaults and saving is harmless', async () => {
  assert.deepEqual(await loadPreferences(), DEFAULT_PREFERENCES);
  await savePreferences({ groupOtherTabsBySite: true });
});

test('saved local preferences take precedence over imported sync settings', async () => {
  const fixture = storageFixture({}, { groupOtherTabsBySite: false });
  await savePreferences({ groupOtherTabsBySite: true });
  assert.equal((await loadPreferences()).groupOtherTabsBySite, true);
  await savePreferences({ openTikTokPipOnAutoPrepare: true });
  assert.deepEqual(await loadPreferences(), {
    groupOtherTabsBySite: true, openTikTokPipOnAutoPrepare: true,
  });
  assert.deepEqual(fixture.values, {
    groupOtherTabsBySite: true, openTikTokPipOnAutoPrepare: true,
  });
});

test('imports sync settings once without overwriting saved local settings', async () => {
  const fixture = storageFixture({ groupOtherTabsBySite: false }, {
    groupOtherTabsBySite: true, openTikTokPipOnAutoPrepare: true,
  });
  assert.deepEqual(await loadPreferences(), {
    groupOtherTabsBySite: false, openTikTokPipOnAutoPrepare: true,
  });
  await loadPreferences();
  assert.equal(fixture.syncReads(), 1);
});

test('failed sync import retains local settings and retries later', async () => {
  const fixture = storageFixture({ groupOtherTabsBySite: true }, { openTikTokPipOnAutoPrepare: true });
  const get = chrome.storage.sync.get;
  chrome.storage.sync.get = async () => { throw new Error('sync unavailable'); };
  assert.deepEqual(await loadPreferences(), { ...DEFAULT_PREFERENCES, groupOtherTabsBySite: true });
  assert.ok(!Object.hasOwn(fixture.values, 'openTikTokPipOnAutoPrepare'));
  chrome.storage.sync.get = get;
  assert.equal((await loadPreferences()).openTikTokPipOnAutoPrepare, true);
});

test('a local write failure is reported rather than claiming the setting was saved', async () => {
  storageFixture();
  chrome.storage.local.set = async () => { throw new Error('local storage unavailable'); };
  await assert.rejects(savePreferences({ groupOtherTabsBySite: true }), /local storage unavailable/);
});
