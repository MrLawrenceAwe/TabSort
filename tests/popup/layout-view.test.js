import assert from 'node:assert/strict';
import test from 'node:test';

import { getSortButtonText } from '../../popup/popup-chrome-view.js';

test('getSortButtonText distinguishes partial and full sorts', () => {
  assert.equal(getSortButtonText(2, 4), 'Move Ready Tabs');
  assert.equal(getSortButtonText(3, 3), 'Sort All Tabs');
});
