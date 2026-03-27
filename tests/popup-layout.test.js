import assert from 'node:assert/strict';
import test from 'node:test';

import { popupState } from '../popup/state.js';
import { getHiddenWarningMessage } from '../popup/popup-layout.js';

test(
  'getHiddenWarningMessage reflects hidden stale-remaining state',
  { concurrency: false },
  () => {
    const original = popupState.hasBackgroundTabsWithStaleRemaining;
    try {
      popupState.hasBackgroundTabsWithStaleRemaining = false;
      assert.equal(getHiddenWarningMessage(), '');

      popupState.hasBackgroundTabsWithStaleRemaining = true;
      assert.equal(getHiddenWarningMessage(), '');
    } finally {
      popupState.hasBackgroundTabsWithStaleRemaining = original;
    }
  },
);
