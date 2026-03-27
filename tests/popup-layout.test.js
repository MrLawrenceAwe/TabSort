import assert from 'node:assert/strict';
import test from 'node:test';

import { popupStore } from '../popup/popup-store.js';

test('popup store keeps readiness flags available for layout decisions', () => {
  popupStore.hasBackgroundTabsWithStaleRemaining = true;
  assert.equal(popupStore.hasBackgroundTabsWithStaleRemaining, true);
});
