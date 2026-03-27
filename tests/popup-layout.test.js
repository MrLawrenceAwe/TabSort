import assert from 'node:assert/strict';
import test from 'node:test';

import { popupState } from '../popup/state.js';
import { getHiddenWarningMessage, shouldShowSortButton } from '../popup/popup-layout.js';

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

test('shouldShowSortButton allows full-window reorders even when tracked tabs are already sorted', () => {
  assert.equal(
    shouldShowSortButton({
      areTrackedTabsSorted: true,
      readyTabCount: 2,
      trackedTabCount: 2,
      canSortWindow: true,
    }),
    true,
  );
});
