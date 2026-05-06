import assert from 'node:assert/strict';
import test from 'node:test';

import { getEmptyStateMessage, getSortButtonText } from '../../popup/popup-layout.js';

test('getEmptyStateMessage explains when no tracked tabs are available', () => {
  assert.equal(
    getEmptyStateMessage(0),
    'Open YouTube watch or shorts tabs in this window to sort them.',
  );
});

test('getEmptyStateMessage explains when one more tab is needed', () => {
  assert.equal(
    getEmptyStateMessage(1),
    'Open at least one more YouTube video tab in this window to sort them.',
  );
});

test('getEmptyStateMessage hides once sorting can be meaningful', () => {
  assert.equal(getEmptyStateMessage(2), '');
});

test('getSortButtonText distinguishes partial and full sorts', () => {
  assert.equal(getSortButtonText(2, 4), 'Move Ready Tabs First');
  assert.equal(getSortButtonText(3, 3), 'Sort All Tabs');
});
