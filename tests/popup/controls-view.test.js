import { deriveSortState } from '../../background/sorting/derive-state.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getOrganisedBadgeText,
  getOrganiseButtonText,
  areReadyTabsLeadingInOrder,
  shouldShowOrganiseButton,
} from '../../popup/controls-view.js';
import { createSortSummary } from '../../shared/sorting/summary.js';

test('getOrganiseButtonText distinguishes partial and full organisation', () => {
  assert.equal(getOrganiseButtonText(2, 4), 'Organise ready tabs');
  assert.equal(getOrganiseButtonText(3, 3), 'Organise tabs');
});

test('shows the organise button when ready videos are behind other tabs', () => {
  const sortSummary = createSortSummary({
    sortableCount: 2,
    readyCount: 2,
    readyTabsLeadInOrder: false,
  });

  assert.equal(shouldShowOrganiseButton(sortSummary, false), true);
});

test('organise button hides for an organised layout and fewer than two ready tabs', () => {
  assert.equal(shouldShowOrganiseButton(createSortSummary({
    readyCount: 1, readyTabsLeadInOrder: false,
  }), false), false);
  assert.equal(shouldShowOrganiseButton(createSortSummary({
    readyCount: 2, sortableCount: 3, readyTabsLeadInOrder: true,
  }), true), false);
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

  assert.equal(areReadyTabsLeadingInOrder(partiallyReadyInOrder, false), true);
  assert.equal(getOrganisedBadgeText(false), 'Ready tabs already in order');
  assert.equal(getOrganisedBadgeText(true), 'YouTube tabs organised');
  assert.equal(areReadyTabsLeadingInOrder(createSortSummary({ readyCount: 1 }), false), false);
});


test('organise remains available for YouTube pages behind another site and for site grouping', () => {
  const records = [1, 2].map((id, index) => ({ id, index, url: `https://www.youtube.com/watch?v=${id}`,
    loadState: 'loaded', remainingSecondsStale: false, videoDetails: { remainingSeconds: id * 60 } }));
  const state = deriveSortState(records, { orderedWindowTabs: [...records,
    { id: 3, index: 2, url: 'https://example.com' },
    { id: 4, index: 3, url: 'https://www.youtube.com/' },
  ] });
  assert.equal(state.sortSummary.readyTabsLeadInOrder, true);
  assert.equal(state.isYouTubeLayoutOrganised, false);
  assert.equal(shouldShowOrganiseButton(state.sortSummary, state.isYouTubeLayoutOrganised), true);
  assert.equal(shouldShowOrganiseButton(createSortSummary({ readyCount: 2, sortableCount: 2, readyTabsLeadInOrder: true }), true), false);
});
