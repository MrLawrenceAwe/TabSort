import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const staticImportPattern =
  /(?:import\s+(?:[^'"]+\s+from\s+)?|import\s*\(\s*)['"]([^'"]+)['"]/g;

function loadManifest() {
  const manifestUrl = new URL('../manifest.json', import.meta.url);
  return JSON.parse(readFileSync(manifestUrl, 'utf8'));
}

function toResourcePath(filePath) {
  return relative(projectRoot, filePath).split(sep).join('/');
}

function resolveModulePath(importerPath, specifier) {
  if (!specifier.startsWith('.')) return null;

  const resolvedPath = resolve(dirname(importerPath), specifier);
  if (extname(resolvedPath)) return resolvedPath;

  for (const extension of ['.js', '.mjs']) {
    const candidate = `${resolvedPath}${extension}`;
    if (existsSync(candidate)) return candidate;
  }

  return resolvedPath;
}

function collectStaticModuleResources(entryResource, visited = new Set()) {
  const entryPath = resolve(projectRoot, entryResource);
  if (visited.has(entryPath)) return [];
  visited.add(entryPath);

  const source = readFileSync(entryPath, 'utf8');
  const resources = [toResourcePath(entryPath)];

  for (const match of source.matchAll(staticImportPattern)) {
    const importedPath = resolveModulePath(entryPath, match[1]);
    if (importedPath) {
      resources.push(...collectStaticModuleResources(toResourcePath(importedPath), visited));
    }
  }

  return resources;
}

test('manifest exposes dynamically imported content modules to YouTube pages', () => {
  const manifest = loadManifest();
  const resources = manifest.web_accessible_resources;

  assert.ok(Array.isArray(resources), 'web_accessible_resources should be defined');

  const youtubeEntry = resources.find((entry) =>
    Array.isArray(entry?.resources) &&
    entry.resources.includes('content/youtube/controller.js'),
  );

  assert.ok(youtubeEntry, 'missing web_accessible_resources entry for content bootstrap module');
  assert.deepEqual(
    [...youtubeEntry.resources].sort(),
    collectStaticModuleResources('content/youtube/controller.js').sort(),
  );
  assert.deepEqual(youtubeEntry.matches, ['*://*.youtube.com/*']);
});

test('manifest injects YouTube runtime on all YouTube pages for SPA navigation', () => {
  const manifest = loadManifest();
  const [youtubeContentScript] = manifest.content_scripts;

  assert.deepEqual(youtubeContentScript.matches, ['*://*.youtube.com/*']);
  assert.deepEqual(youtubeContentScript.js, ['content/youtube/youtube-page-bootstrap.js']);
});

test('manifest avoids unused tab group permission', () => {
  const manifest = loadManifest();
  assert.equal(manifest.permissions.includes('tabGroups'), false);
});
