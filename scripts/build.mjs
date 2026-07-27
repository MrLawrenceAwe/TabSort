import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(projectRoot, 'dist');

await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [resolve(projectRoot, 'content/youtube/page/entry.js')],
  outfile: resolve(outputDirectory, 'content-runtime.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  legalComments: 'none',
  sourcemap: false,
});

process.stdout.write('Built dist/content-runtime.js\n');
