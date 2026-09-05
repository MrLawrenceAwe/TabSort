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

    await expect(popup.getByRole('heading', { name: 'YouTube tabs' })).toBeVisible();
    await expect(popup.getByText('No YouTube video tabs in this window.')).toBeVisible();

    const firstVideo = await context.newPage();
    await firstVideo.goto('https://www.youtube.com/watch?v=smoke-one');
    const secondVideo = await context.newPage();
    await secondVideo.goto('https://www.youtube.com/watch?v=smoke-two');

    await popup.reload();
    await expect(popup.locator('#tabsTable tbody tr')).toHaveCount(2);
    await expect(popup.getByText('Fixture smoke-one')).toBeVisible();
    await expect(popup.getByText('Fixture smoke-two')).toBeVisible();

    // Toolbar popups size themselves from their document, unlike a normal tab.
    await serviceWorker.evaluate(() => chrome.action.openPopup());
    await expect.poll(() => popup.evaluate(() => {
      const view = chrome.extension.getViews({ type: 'popup' })[0];
      if (!view) return null;
      return {
        width: view.innerWidth,
        hasHorizontalOverflow: view.document.documentElement.scrollWidth > view.innerWidth,
      };
    })).toEqual({ width: 600, hasHorizontalOverflow: false });

    // Exercise the popup view with a deterministic ready subset so theme changes
    // and highlighting are checked independently of media-loading timing.
    await popup.evaluate(async () => {
      const { renderTabList } = await import(chrome.runtime.getURL('popup/tab-list-view.js'));
      renderTabList({
        trackedTabOrder: [1, 2],
        tabRecordsById: {
          1: {
            id: 1, index: 0, loadState: 'loaded', contentScriptReady: true,
            remainingSecondsStale: false, videoDetails: { title: 'Ready video', remainingSeconds: 20 },
          },
          2: {
            id: 2, index: 1, loadState: 'loaded', contentScriptReady: true,
            remainingSecondsStale: true, videoDetails: { title: 'Waiting video' },
          },
        },
        sortSummary: { sortableCount: 2, readyCount: 1, readyPrefixMatchesPlan: true },
        isTargetOrderApplied: false,
      });
    });
    await expect(popup.locator('#tabsTable .ready-row')).toHaveCount(1);
    await expect(popup.locator('#backlogSummary')).toHaveText('2 videos · 1m remaining · 1 unknown');
    for (const [colorScheme, background, readyBackground] of [
      ['light', 'rgb(252, 252, 250)', 'rgb(238, 245, 239)'],
      ['dark', 'rgb(25, 25, 25)', 'rgb(32, 43, 35)'],
    ]) {
      await popup.emulateMedia({ colorScheme });
      await expect(popup.locator('body')).toHaveCSS('background-color', background);
      await expect(popup.locator('.ready-row')).toHaveCSS('background-color', readyBackground);
    }

  } finally {
    await context.close();
    rmSync(userDataDirectory, { recursive: true, force: true });
  }
});
