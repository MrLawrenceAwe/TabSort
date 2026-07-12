import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getYouTubeVideoId,
  hasYouTubeVideoChanged,
} from '../background/youtube/urls.js';

test('watch and Shorts URLs use the same video identity', () => {
  const watchUrl = 'https://www.youtube.com/watch?v=abc123';
  const shortsUrl = 'https://www.youtube.com/shorts/abc123';

  assert.equal(getYouTubeVideoId(watchUrl), 'abc123');
  assert.equal(getYouTubeVideoId(shortsUrl), 'abc123');
  assert.equal(hasYouTubeVideoChanged(watchUrl, shortsUrl), false);
});
