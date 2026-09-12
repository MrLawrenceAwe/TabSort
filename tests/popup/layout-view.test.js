import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getOrganisedBadgeText,
  getOrganiseButtonText,
  hasReadyTabsInOrder,
  shouldShowOrganiseButton,
} from '../../popup/layout-view.js';
import { createSortSummary } from '../../shared/sorting/summary.js';

test('getOrganiseButtonText distinguishes partial and full organisation', () => {
  assert.equal(getOrganiseButtonText(2, 4), 'Organise Ready Tabs');
  assert.equal(getOrganiseButtonText(3, 3), 'Organise Tabs');
});

test('shows the organise button when ready videos are behind other tabs', () => {
  const sortSummary = createSortSummary({
    sortableCount: 2,
    readyCount: 2,
    readyTabsLeadInOrder: false,
  });

  assert.equal(shouldShowOrganiseButton(sortSummary, false), true);
});

test('organise button requires two ready tabs and an unapplied ready prefix', () => {
  assert.equal(shouldShowOrganiseButton(createSortSummary({
    readyCount: 1, readyTabsLeadInOrder: false,
  }), false), false);
  assert.equal(shouldShowOrganiseButton(createSortSummary({
    readyCount: 2, sortableCount: 3, readyTabsLeadInOrder: true,
  }), false), false);
  assert.equal(shouldShowOrganiseButton(createSortSummary({
    readyCount: 2, sortableCount: 3, readyTabsLeadInOrder: false,
  }), false), true);
});

test('identifies ready tabs that are already in their intended order', () => {
  const partiallyReadyInOrder = createSortSummary({
    readyCount: 2,
    sortableCount: 3,
    readyTabsLeadInOrder: true,
  });

  assert.equal(hasReadyTabsInOrder(partiallyReadyInOrder, false), true);
  assert.equal(getOrganisedBadgeText(false), 'Ready tabs already in order');
  assert.equal(getOrganisedBadgeText(true), 'YouTube tabs organised');
  assert.equal(hasReadyTabsInOrder(createSortSummary({ readyCount: 1 }), false), false);
});
