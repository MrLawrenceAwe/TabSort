import { test as base, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export const test = base.extend({
  context: async ({ playwright }, use) => {
    const directory = mkdtempSync(join(tmpdir(), 'tabsort-playwright-'));
    let context;
    try {
      context = await playwright.chromium.launchPersistentContext(directory, {
        headless: false,
        args: [`--disable-extensions-except=${projectRoot}`, `--load-extension=${projectRoot}`],
      });
      await use(context);
    } finally {
      try { await context?.close(); }
      finally { rmSync(directory, { recursive: true, force: true }); }
    }
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await use(worker);
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
});

export { expect };
