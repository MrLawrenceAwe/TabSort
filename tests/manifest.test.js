import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function loadManifest() {
  const manifestUrl = new URL('../manifest.json', import.meta.url);
  return JSON.parse(readFileSync(manifestUrl, 'utf8'));
}

test('manifest uses a bundled content runtime without web-accessible source modules', () => {
  const manifest = loadManifest();
  const [youtubeContentScript] = manifest.content_scripts;
  assert.deepEqual(youtubeContentScript.js, ['dist/content-runtime.js']);
  assert.equal(existsSync(resolve(projectRoot, youtubeContentScript.js[0])), true);
  assert.equal(manifest.web_accessible_resources, undefined);
});

test('manifest injects YouTube runtime on all YouTube pages for SPA navigation', () => {
  const manifest = loadManifest();
  const [youtubeContentScript] = manifest.content_scripts;

  assert.deepEqual(youtubeContentScript.matches, ['*://*.youtube.com/*']);
  assert.deepEqual(youtubeContentScript.js, ['dist/content-runtime.js']);
});

test('manifest avoids unused tab group permission', () => {
  const manifest = loadManifest();
  assert.equal(manifest.permissions.includes('tabGroups'), false);
});

test('manifest references complete extension icon sizes', () => {
  const manifest = loadManifest();
  assert.deepEqual(Object.keys(manifest.icons), ['16', '32', '48', '128']);
  for (const iconPath of Object.values(manifest.icons)) {
    assert.equal(existsSync(resolve(projectRoot, iconPath)), true);
  }
});
