import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';

const projectRoot = new URL('..', import.meta.url).pathname;
const ignoredDirectories = new Set(['.git', '.tools', 'node_modules']);
const checkedFiles = [];
const importPattern =
  /(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function collectJavaScriptFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        collectJavaScriptFiles(join(directory, entry.name));
      }
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
      checkedFiles.push(join(directory, entry.name));
    }
  }
}

collectJavaScriptFiles(projectRoot);

for (const filePath of checkedFiles.sort()) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const label = relative(projectRoot, filePath);
    process.stderr.write(`Syntax check failed for ${label}\n`);
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }

  const source = readFileSync(filePath, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] || match[2];
    if (!specifier?.startsWith('.')) continue;
    const importedPath = resolve(dirname(filePath), specifier);
    if (!existsSync(importedPath)) {
      const label = relative(projectRoot, filePath);
      process.stderr.write(`Unresolved import in ${label}: ${specifier}\n`);
      process.exit(1);
    }
  }
}

process.stdout.write(`Checked ${checkedFiles.length} JavaScript files.\n`);
