import assert from 'node:assert/strict';
import test from 'node:test';

import { popupState } from '../popup/state.js';

test('popup state keeps readiness flags available for view decisions', () => {
  popupState.hasBackgroundTabsWithStaleRemaining = true;
  assert.equal(popupState.hasBackgroundTabsWithStaleRemaining, true);
});
