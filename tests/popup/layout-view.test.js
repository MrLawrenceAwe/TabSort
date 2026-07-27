import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSortButtonText,
  shouldShowSortButton,
} from '../../popup/popup-layout-view.js';
import { createSortSummary } from '../../shared/sorting/summary.js';

test('getSortButtonText distinguishes partial and full sorts', () => {
  assert.equal(getSortButtonText(2, 4), 'Organise Ready Tabs');
  assert.equal(getSortButtonText(3, 3), 'Sort Tabs');
});

test('shows the sort button when ready videos are behind other tabs', () => {
  const sortSummary = createSortSummary({
    counts: { tracked: 2, sortReady: 2 },
    sortReadyTabs: {
      contiguous: true,
      atFront: false,
      outOfOrder: false,
    },
  });

  assert.equal(shouldShowSortButton(sortSummary, false), true);
});
