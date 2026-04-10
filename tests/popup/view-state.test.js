import assert from 'node:assert/strict';
import test from 'node:test';

import { viewState } from '../../popup/view.js';

test('popup view model keeps sort summary flags available for view decisions', () => {
  viewState.sortSummary.backgroundTabs.haveStaleRemainingTime = true;
  assert.equal(viewState.sortSummary.backgroundTabs.haveStaleRemainingTime, true);
});
