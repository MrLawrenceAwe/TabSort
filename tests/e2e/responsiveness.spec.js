import { chromium, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let context;
let directory;
let extensionId;

test.beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'tabsort-responsiveness-'));
  const projectRoot = resolve('.');
  context = await chromium.launchPersistentContext(directory, {
    headless: false,
    args: [`--disable-extensions-except=${projectRoot}`, `--load-extension=${projectRoot}`],
  });
  // These pages contain no players, sources or autoplay: existing browser
  // playback and audio preferences are never involved in the tests.
  await context.route('https://www.youtube.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<html><head><title>Live fixture</title><meta itemprop="isLiveBroadcast" content="True"></head><body>No media</body></html>',
  }));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
});

test.afterEach(async () => {
  await context?.close();
  rmSync(directory, { recursive: true, force: true });
});

test('snapshot loading finishes while a tracked renderer is unresponsive', async () => {
  const video = await context.newPage();
  await video.goto('https://www.youtube.com/watch?v=stalled-renderer');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await expect(popup.locator('#tabsTable')).toContainText('Live Stream');
  const cdp = await context.newCDPSession(video);
  await cdp.send('Debugger.enable');
  await cdp.send('Debugger.pause');
  try {
    await popup.reload();
    // Initial loading must finish before the renderer resumes. Allow for the
    // popup's existing retry when another reconciliation supersedes its read.
    await expect(popup.locator('#popupStateMessage')).toBeHidden({ timeout: 7500 });
    await expect(popup.locator('#tabsTable tbody tr')).toHaveCount(1);
    await expect(popup.locator('#popupError')).toBeHidden();
  } finally {
    await cdp.send('Debugger.resume');
    await cdp.detach();
  }
});

test('snapshot refresh preserves keyboard focus on the same tab action', async () => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.evaluate(async () => {
    window.dispatchEvent(new Event('unload'));
    const { renderTabList } = await import(chrome.runtime.getURL('popup/tab-list-view.js'));
    const otherControl = document.createElement('button');
    otherControl.textContent = 'Other control';
    document.body.appendChild(otherControl);
    const records = [
      { id: 1, index: 0, loadState: 'loaded', contentScriptReady: true,
        remainingSecondsStale: false, videoDetails: { title: 'Ready', remainingSeconds: 20 } },
      { id: 2, index: 1, loadState: 'discarded', remainingSecondsStale: true,
        videoDetails: { title: 'Sleeping' } },
    ];
    window.focusFixture = {
      records,
      render: () => renderTabList(records, { requestAction: async (type, data) => {
        window.focusFixture.action = { type, data };
        return false;
      } }),
    };
    window.focusFixture.render();
  });
  const button = popup.getByRole('button', { name: 'View tab', exact: true });
  await button.press('Tab');
  await popup.keyboard.press('Shift+Tab');
  await expect(button).toBeFocused();
  await popup.evaluate(() => {
    // Changing order must not transfer focus to another tab's row.
    window.focusFixture.records.reverse();
    window.focusFixture.render();
    window.focusFixture.render();
  });
  await expect(button).toBeFocused();
  await button.press('Enter');
  expect(await popup.evaluate(() => window.focusFixture.action)).toEqual({ type: 'activateTab', data: { tabId: 2 } });

  const otherControl = popup.getByRole('button', { name: 'Other control', exact: true });
  await otherControl.focus();
  await popup.evaluate(() => window.focusFixture.render());
  await expect(otherControl).toBeFocused();
  await button.focus();
  await expect(button).toBeFocused();
  // A replacement operation (View -> Reload) must not receive focus, nor
  // should an action disappear and move focus onto an unrelated tab.
  await popup.evaluate(() => {
    const sleeping = window.focusFixture.records.find(record => record.id === 2);
    sleeping.loadState = 'loaded';
    sleeping.contentScriptReady = false;
    window.focusFixture.render();
  });
  const reloadButton = popup.getByRole('button', { name: 'Reload tab', exact: true });
  await expect(reloadButton).not.toBeFocused();
  await reloadButton.focus();
  await popup.evaluate(() => {
    const records = window.focusFixture.records;
    records.splice(records.findIndex(record => record.id === 2), 1);
    window.focusFixture.render();
  });
  await expect(reloadButton).toHaveCount(0);
  await expect(otherControl).not.toBeFocused();
});
