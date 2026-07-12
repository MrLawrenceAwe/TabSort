import assert from 'node:assert/strict';
import test from 'node:test';

import { getSortButtonText } from '../../popup/popup-layout-view.js';

test('getSortButtonText distinguishes partial and full sorts', () => {
  assert.equal(getSortButtonText(2, 4), 'Organise Ready Tabs');
  assert.equal(getSortButtonText(3, 3), 'Sort Tabs');
});
