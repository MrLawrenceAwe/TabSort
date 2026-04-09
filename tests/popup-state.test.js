import assert from 'node:assert/strict';
import test from 'node:test';

import { popupViewModel } from '../popup/view-model.js';

test('popup view model keeps sort summary flags available for view decisions', () => {
  popupViewModel.sortSummary.backgroundTabs.haveStaleRemainingTime = true;
  assert.equal(popupViewModel.sortSummary.backgroundTabs.haveStaleRemainingTime, true);
});
