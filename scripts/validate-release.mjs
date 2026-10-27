import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) =>
  JSON.parse(readFileSync(resolve(projectRoot, relativePath), 'utf8'));

const manifest = readJson('manifest.json');
const packageMetadata = readJson('package.json');
const errors = [];

for (const [field, value] of [
  ['background.service_worker', manifest.background?.service_worker],
  ['action.default_popup', manifest.action?.default_popup],
]) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`Required manifest field is missing or invalid: ${field}`);
  }
}

if (manifest.version !== packageMetadata.version) {
  errors.push(
    `Version mismatch: manifest.json=${manifest.version}, package.json=${packageMetadata.version}`,
  );
}

const requiredFiles = new Set([
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  'preparation/progress.html',
  'preparation/placeholder.html',
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((entry) => entry.js || []),
  ...(manifest.content_scripts || []).flatMap((entry) => entry.css || []),
]);

for (const relativePath of requiredFiles) {
  if (typeof relativePath !== 'string' || !relativePath.trim()) continue;
  const resourcePath = resolve(projectRoot, relativePath);
  let isFile = false;
  try { isFile = statSync(resourcePath).isFile(); } catch { /* Report missing resources below. */ }
  if (!isFile) {
    errors.push(`Release resource is missing: ${relativePath}`);
    continue;
  }
  if (!relativePath.endsWith('.html')) continue;
  const html = readFileSync(resourcePath, 'utf8');
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const reference = tag.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) continue;
    const localPath = reference.split(/[?#]/)[0];
    const linkedPath = localPath.startsWith('/')
      ? resolve(projectRoot, localPath.slice(1))
      : resolve(dirname(resourcePath), localPath);
    requiredFiles.add(relative(projectRoot, linkedPath));
  }
}

if (manifest.web_accessible_resources?.length) {
  errors.push('The bundled content runtime should not require web_accessible_resources.');
}

if (errors.length) {
  errors.forEach((error) => process.stderr.write(`${error}\n`));
  process.exit(1);
}

process.stdout.write(`Validated TabSort ${manifest.version} release resources.\n`);
