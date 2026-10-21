import assert from 'node:assert/strict';
import test from 'node:test';
import { parseYouTubeInitialPlayerResponse } from '../../content/youtube/metadata/player-response.js';

test('player response parsing skips invalid candidates and respects braces inside strings', () => {
  const response = { videoDetails: { videoId: 'one', title: 'A {title} with "quotes"' } };
  const environment = {
    window: {},
    document: { scripts: [{ textContent:
      'var ytInitialPlayerResponse = {invalid}; var ytInitialPlayerResponse = ' +
      JSON.stringify(response) + ';' }] },
  };
  assert.deepEqual(parseYouTubeInitialPlayerResponse(assert.fail, environment), response);
});

test('player response parsing returns an empty result when no valid candidate exists', () => {
  const environment = { window: {}, document: { scripts: [
    { textContent: 'var ytInitialPlayerResponse = {incomplete' },
  ] } };
  assert.deepEqual(parseYouTubeInitialPlayerResponse(assert.fail, environment), {});
});
