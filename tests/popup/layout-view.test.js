import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getOrganiseButtonText,
  shouldShowOrganiseButton,
} from '../../popup/popup-layout-view.js';
import { createSortSummary } from '../../shared/sorting/summary.js';

test('getOrganiseButtonText distinguishes partial and full organisation', () => {
  assert.equal(getOrganiseButtonText(2, 4), 'Organise Ready Tabs');
  assert.equal(getOrganiseButtonText(3, 3), 'Organise Tabs');
});

test('shows the organise button when ready videos are behind other tabs', () => {
  const sortSummary = createSortSummary({
    trackedCount: 2,
    sortableCount: 2,
    readyCount: 2,
    readyTabsContiguous: true,
    readyTabsAtFront: false,
    readyTabsOutOfOrder: false,
  });

  assert.equal(shouldShowOrganiseButton(sortSummary, false), true);
});
