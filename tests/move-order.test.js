import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOtherTabOrder,
  buildYouTubeTabOrder,
} from '../background/sorting/move-order.js';

test('buildYouTubeTabOrder keeps tracked video tabs in requested order then appends other YouTube tabs', () => {
  const unpinnedTabs = [
    { id: 1, index: 0, url: 'https://www.youtube.com/watch?v=1' },
    { id: 2, index: 1, url: 'https://www.youtube.com/watch?v=2' },
    { id: 3, index: 2, url: 'https://www.youtube.com/feed/subscriptions' },
    { id: 4, index: 3, url: 'https://example.com/a' },
  ];

  const orderedTrackedTabIds = [2, 1, 99];
  assert.deepEqual(buildYouTubeTabOrder(unpinnedTabs, orderedTrackedTabIds), [2, 1, 3]);
});

test('buildOtherTabOrder returns current order when grouping is disabled', () => {
  const unpinnedTabs = [
    { id: 1, index: 0, url: 'https://www.youtube.com/watch?v=1' },
    { id: 2, index: 1, url: 'https://example.com/a' },
    { id: 3, index: 2, url: 'https://docs.example.com/b' },
  ];

  assert.deepEqual(buildOtherTabOrder(unpinnedTabs, false), [2, 3]);
});

test('buildOtherTabOrder groups by first-seen domain and preserves intra-domain order', () => {
  const unpinnedTabs = [
    { id: 1, index: 0, url: 'https://a.com/1' },
    { id: 2, index: 1, url: 'https://b.com/1' },
    { id: 3, index: 2, url: 'https://a.com/2' },
    { id: 4, index: 3, url: 'https://b.com/2' },
  ];

  assert.deepEqual(buildOtherTabOrder(unpinnedTabs, true), [1, 3, 2, 4]);
});
