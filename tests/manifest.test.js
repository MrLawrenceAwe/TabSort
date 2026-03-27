import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

function loadManifest() {
  const manifestUrl = new URL('../manifest.json', import.meta.url);
  return JSON.parse(readFileSync(manifestUrl, 'utf8'));
}

test('manifest exposes dynamically imported content modules to YouTube pages', () => {
  const manifest = loadManifest();
  const resources = manifest.web_accessible_resources;

  assert.ok(Array.isArray(resources), 'web_accessible_resources should be defined');

  const youtubeEntry = resources.find((entry) =>
    Array.isArray(entry?.resources) &&
    entry.resources.includes('content/youtube/runtime.js'),
  );

  assert.ok(youtubeEntry, 'missing web_accessible_resources entry for content bootstrap module');
  assert.deepEqual(youtubeEntry.resources, [
    'content/youtube/runtime.js',
    'content/youtube/metadata.js',
    'shared/constants.js',
    'shared/live-detection.js',
    'shared/guards.js',
  ]);
  assert.deepEqual(youtubeEntry.matches, ['*://*.youtube.com/*']);
});
