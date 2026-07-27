import { chromium, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('loads the bundled runtime and reports tracked YouTube tabs in the popup', async () => {
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'tabsort-playwright-'));
  const context = await chromium.launchPersistentContext(userDataDirectory, {
    headless: false,
    args: [
      `--disable-extensions-except=${projectRoot}`,
      `--load-extension=${projectRoot}`,
    ],
  });

  try {
    await context.route('https://www.youtube.com/**', async (route) => {
      const videoId = new URL(route.request().url()).searchParams.get('v') || 'fixture';
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head><title>Fixture ${videoId}</title></head>
          <body><main><h1>Fixture ${videoId}</h1></main></body></html>`,
      });
    });

    const serviceWorker =
      context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(serviceWorker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    await expect(popup.getByRole('heading', { name: 'TabSort for YouTube' })).toBeVisible();
    await expect(popup.getByText('No YouTube video tabs in this window.')).toBeVisible();

    const firstVideo = await context.newPage();
    await firstVideo.goto('https://www.youtube.com/watch?v=smoke-one');
    const secondVideo = await context.newPage();
    await secondVideo.goto('https://www.youtube.com/watch?v=smoke-two');

    await popup.reload();
    await expect(popup.locator('#tabsTable tbody tr')).toHaveCount(2);
    await expect(popup.getByText('Fixture smoke-one')).toBeVisible();
    await expect(popup.getByText('Fixture smoke-two')).toBeVisible();
  } finally {
    await context.close();
    rmSync(userDataDirectory, { recursive: true, force: true });
  }
});
