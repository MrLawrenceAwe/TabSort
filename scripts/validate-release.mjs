import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) =>
  JSON.parse(readFileSync(resolve(projectRoot, relativePath), 'utf8'));

const manifest = readJson('manifest.json');
const packageMetadata = readJson('package.json');
const errors = [];

if (manifest.version !== packageMetadata.version) {
  errors.push(
    `Version mismatch: manifest.json=${manifest.version}, package.json=${packageMetadata.version}`,
  );
}

const requiredFiles = new Set([
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((entry) => entry.js || []),
]);

for (const relativePath of requiredFiles) {
  if (typeof relativePath === 'string' && !existsSync(resolve(projectRoot, relativePath))) {
    errors.push(`Manifest resource is missing: ${relativePath}`);
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
