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
    entry.resources.includes('content/youtube/page-runtime-session.js'),
  );

  assert.ok(youtubeEntry, 'missing web_accessible_resources entry for content bootstrap module');
	  assert.deepEqual(youtubeEntry.resources, [
	    'content/youtube/page-runtime-session.js',
	    'content/youtube/media-readiness.js',
	    'content/youtube/media-elements.js',
	    'content/youtube/video-details.js',
	    'content/youtube/youtube-player-response.js',
	    'content/youtube/live-status.js',
	    'content/youtube/title-observer.js',
	    'content/youtube/video-metrics.js',
	    'content/youtube/media-config.js',
	    'shared/guards.js',
	    'shared/messages.js',
  ]);
  assert.deepEqual(youtubeEntry.matches, ['*://*.youtube.com/*']);
});

test('manifest injects YouTube runtime on all YouTube pages for SPA navigation', () => {
  const manifest = loadManifest();
  const [youtubeContentScript] = manifest.content_scripts;

  assert.deepEqual(youtubeContentScript.matches, ['*://*.youtube.com/*']);
  assert.deepEqual(youtubeContentScript.js, ['content/youtube/bootstrap-entry.js']);
});

test('manifest avoids unused tab group permission', () => {
  const manifest = loadManifest();
  assert.equal(manifest.permissions.includes('tabGroups'), false);
});
