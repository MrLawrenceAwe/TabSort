import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

const projectRoot = new URL('..', import.meta.url).pathname;
const ignoredDirectories = new Set(['.git', '.tools', 'node_modules']);
const checkedFiles = [];

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
}

process.stdout.write(`Checked ${checkedFiles.length} JavaScript files.\n`);
