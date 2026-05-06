import test from 'node:test';
import assert from 'node:assert/strict';

import { getStorageArea, loadSortOptions, saveSortOptions } from '../shared/storage.js';
import { DEFAULT_SORT_OPTIONS } from '../shared/sort-options.js';

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

test('getStorageArea returns null when chrome is unavailable', async () => {
  await withMissingChrome(() => {
    assert.equal(getStorageArea(), null);
  });
});

test('loadSortOptions falls back to defaults when chrome is unavailable', async () => {
  await withMissingChrome(async () => {
    const options = await loadSortOptions();
    assert.deepEqual(options, DEFAULT_SORT_OPTIONS);
  });
});

test('saveSortOptions resolves when chrome is unavailable', async () => {
  await withMissingChrome(async () => {
    await assert.doesNotReject(() => saveSortOptions({ groupNonYoutubeTabsByDomain: true }));
  });
});
