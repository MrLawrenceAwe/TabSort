import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
} from '../shared/preferences.js';

function withMissingChrome(fn) {
  const hadChrome = Object.prototype.hasOwnProperty.call(globalThis, 'chrome');
  const originalChrome = globalThis.chrome;

  Reflect.deleteProperty(globalThis, 'chrome');

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (hadChrome) {
        globalThis.chrome = originalChrome;
      } else {
        Reflect.deleteProperty(globalThis, 'chrome');
      }
    });
}

function withChromeStorage(storage, fn) {
  const hadChrome = Object.prototype.hasOwnProperty.call(globalThis, 'chrome');
  const originalChrome = globalThis.chrome;
  globalThis.chrome = {
    storage,
  };

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (hadChrome) {
        globalThis.chrome = originalChrome;
      } else {
        Reflect.deleteProperty(globalThis, 'chrome');
      }
    });
}

test('loadPreferences falls back to defaults when chrome is unavailable', async () => {
  await withMissingChrome(async () => {
    const options = await loadPreferences();
    assert.deepEqual(options, DEFAULT_PREFERENCES);
  });
});

test('savePreferences resolves when chrome is unavailable', async () => {
  await withMissingChrome(async () => {
    await assert.doesNotReject(() => savePreferences({ groupOtherTabsBySite: true }));
  });
});

test('loadPreferences falls back to local storage when sync storage fails', async () => {
  const calls = [];
  await withChromeStorage(
    {
      sync: {
        async get() {
          calls.push('sync');
          throw new Error('sync unavailable');
        },
      },
      local: {
        async get() {
          calls.push('local');
          return { groupOtherTabsBySite: true };
        },
      },
    },
    async () => {
      assert.deepEqual(await loadPreferences(), {
        groupOtherTabsBySite: true,
        openTikTokPipOnAutoPrepare: false,
      });
    },
  );
  assert.deepEqual(calls, ['sync', 'local']);
});

test('savePreferences falls back to local storage when sync storage fails', async () => {
  const calls = [];
  const update = { groupOtherTabsBySite: true };
  await withChromeStorage(
    {
      sync: {
        async set(items) {
          calls.push(['sync', items]);
          throw new Error('sync unavailable');
        },
      },
      local: {
        async set(items) {
          calls.push(['local', items]);
        },
      },
    },
    () => savePreferences(update),
  );
  assert.deepEqual(calls, [
    ['sync', update],
    ['local', update],
  ]);
});
