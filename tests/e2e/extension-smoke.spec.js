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

    await expect(popup.getByRole('heading', { name: 'YouTube Watch Tabs' })).toBeVisible();
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
    await expect(popup.locator('td.remaining-time').nth(1)).toHaveText('Needs viewing');
    await expect(popup.getByRole('button', { name: 'Auto-prepare tabs', exact: true })).toBeVisible();
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

test('auto-prepares deferred media after activation, survives popup closure, and stops before visiting another tab', async () => {
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'tabsort-auto-prepare-'));
  const context = await chromium.launchPersistentContext(userDataDirectory, {
    headless: false,
    args: [`--disable-extensions-except=${projectRoot}`, `--load-extension=${projectRoot}`],
  });
  // A real one-second silent WAV decoded by Chromium's HTMLVideoElement.
  const wav = Buffer.alloc(44 + 16000);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(16000, 40);
  try {
    await context.route('https://www.youtube.com/**', route => {
      const stalled = route.request().url().includes('stalled');
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html>
        <html><head><title>Deferred video</title><meta itemprop="duration" content="PT1S"></head>
        <body><video preload="auto"></video><script>
          let mounted = false;
          function reveal() {
            if (document.hidden || mounted || ${stalled}) return;
            mounted = true;
            setTimeout(() => { document.querySelector('video').src =
              'data:audio/wav;base64,${wav.toString('base64')}'; }, 300);
          }
          document.addEventListener('visibilitychange', reveal);
          reveal();
        </script></body></html>` });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    const firstVideo = await context.newPage();
    const secondVideo = await context.newPage();
    await popup.bringToFront();
    await firstVideo.goto('https://www.youtube.com/watch?v=deferred-one');
    await secondVideo.goto('https://www.youtube.com/watch?v=deferred-two');
    const ids = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.youtube.com/*' })).map(tab => tab.id));
    await popup.reload();
    await expect(popup.locator('#organiseStatus')).toContainText('0 of 2');
    await popup.getByRole('button', { name: 'Auto-prepare tabs', exact: true }).click();
    await expect.poll(() => context.pages().some(page => page.url().endsWith('/auto-preparation.html'))).toBe(true);
    const progress = context.pages().find(page => page.url().endsWith('/auto-preparation.html'));
    await popup.close();
    await expect(progress.locator('#progress')).toHaveText('2 of 2 checked · 2 ready · 0 skipped', { timeout: 10000 });
    await expect(progress.getByRole('heading')).toHaveText('Auto-preparation finished');
    await expect.poll(() => progress.evaluate(async ids => {
      const { windowId } = await chrome.tabs.get(ids[0]);
      const snapshot = await chrome.runtime.sendMessage({ type: 'getTabSnapshot', windowId });
      return ids.every(id => snapshot.tabRecordsById[id]?.videoDetails.remainingSeconds === 1 && !snapshot.tabRecordsById[id]?.remainingSecondsStale);
    }, ids)).toBe(true);

    // These pages never expose media. Stop while the first is waiting.
    await progress.close();
    const firstStalled = await context.newPage();
    const secondStalled = await context.newPage();
    const reopened = await context.newPage();
    await reopened.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await firstStalled.goto('https://www.youtube.com/watch?v=stalled-one');
    await secondStalled.goto('https://www.youtube.com/watch?v=stalled-two');
    const stalledIds = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.youtube.com/watch?v=stalled-*' })).map(tab => tab.id));
    await reopened.reload();
    await reopened.getByRole('button', { name: 'Auto-prepare tabs', exact: true }).click();
    await expect.poll(() => context.pages().some(page => page.url().endsWith('/auto-preparation.html'))).toBe(true);
    const stopWindow = context.pages().find(page => page.url().endsWith('/auto-preparation.html'));
    await expect.poll(() => worker.evaluate(async id => (await chrome.tabs.get(id)).active, stalledIds[0])).toBe(true);
    await stopWindow.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(stopWindow.getByRole('heading')).toHaveText('Stopped');
    const state = await worker.evaluate(async ids => ({
      firstActive: (await chrome.tabs.get(ids[0])).active,
      secondActive: (await chrome.tabs.get(ids[1])).active,
    }), stalledIds);
    expect(state).toEqual({ firstActive: true, secondActive: false });
  } finally {
    await context.close();
    rmSync(userDataDirectory, { recursive: true, force: true });
  }
});
