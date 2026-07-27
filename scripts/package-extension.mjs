import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(projectRoot, 'manifest.json'), 'utf8'));
const releaseDirectory = resolve(projectRoot, 'release');
const archiveName = `tabsort-v${manifest.version}.zip`;
const archivePath = resolve(releaseDirectory, archiveName);
const includedPaths = ['manifest.json', 'background', 'popup', 'shared', 'dist', 'assets/icons'];

mkdirSync(releaseDirectory, { recursive: true });
rmSync(archivePath, { force: true });

const result = spawnSync(
  'zip',
  ['-qr', archivePath, ...includedPaths, '-x', '*/.DS_Store', '.DS_Store'],
  {
    cwd: projectRoot,
    encoding: 'utf8',
  },
);
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'Failed to create extension archive.\n');
  process.exit(result.status ?? 1);
}

process.stdout.write(`Created release/${archiveName}\n`);
