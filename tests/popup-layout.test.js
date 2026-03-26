import assert from 'node:assert/strict';
import test from 'node:test';

import { popupState } from '../popup/state.js';
import { getHiddenWarningMessage } from '../popup/popup-layout.js';

test(
  'getHiddenWarningMessage reflects hidden stale-remaining state',
  { concurrency: false },
  () => {
    const original = popupState.hiddenTabsMayHaveStaleRemaining;
    try {
      popupState.hiddenTabsMayHaveStaleRemaining = false;
      assert.equal(getHiddenWarningMessage(), '');

      popupState.hiddenTabsMayHaveStaleRemaining = true;
      assert.equal(
        getHiddenWarningMessage(),
        'Some background tabs may have stale remaining time. Open each tab once to refresh.',
      );
    } finally {
      popupState.hiddenTabsMayHaveStaleRemaining = original;
    }
  },
);
