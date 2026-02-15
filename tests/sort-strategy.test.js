import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNonYoutubeOrder, buildYoutubeTabOrder } from '../background/sort-strategy.js';

test('buildYoutubeTabOrder keeps watch tabs in requested order then appends other YouTube tabs', () => {
  const unpinnedTabs = [
    { id: 1, index: 0, url: 'https://www.youtube.com/watch?v=1' },
    { id: 2, index: 1, url: 'https://www.youtube.com/watch?v=2' },
    { id: 3, index: 2, url: 'https://www.youtube.com/feed/subscriptions' },
    { id: 4, index: 3, url: 'https://example.com/a' },
  ];

  const orderedWatchIds = [2, 1, 99];
  assert.deepEqual(buildYoutubeTabOrder(unpinnedTabs, orderedWatchIds), [2, 1, 3]);
});

test('buildNonYoutubeOrder returns current order when grouping is disabled', () => {
  const unpinnedTabs = [
    { id: 1, index: 0, url: 'https://www.youtube.com/watch?v=1' },
    { id: 2, index: 1, url: 'https://example.com/a' },
    { id: 3, index: 2, url: 'https://docs.example.com/b' },
  ];

  assert.deepEqual(buildNonYoutubeOrder(unpinnedTabs, false), [2, 3]);
});

test('buildNonYoutubeOrder groups by first-seen domain and preserves intra-domain order', () => {
  const unpinnedTabs = [
    { id: 1, index: 0, url: 'https://a.com/1' },
    { id: 2, index: 1, url: 'https://b.com/1' },
    { id: 3, index: 2, url: 'https://a.com/2' },
    { id: 4, index: 3, url: 'https://b.com/2' },
  ];

  assert.deepEqual(buildNonYoutubeOrder(unpinnedTabs, true), [1, 3, 2, 4]);
});
