import { expect, test } from './fixtures/extension.js';

test('prepares media while browsing continues and restores the tabs', async ({ context, worker, extensionId }) => {
  test.setTimeout(60_000);
  // A real one-second silent WAV decoded by Chromium's HTMLVideoElement.
  const wav = Buffer.alloc(44 + 16000);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(16000, 40);
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

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  const firstVideo = await context.newPage();
  const secondVideo = await context.newPage();
  await popup.bringToFront();
  await firstVideo.goto('https://www.youtube.com/watch?v=deferred-one');
  await secondVideo.goto('https://www.youtube.com/watch?v=deferred-two');
  let ids = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.youtube.com/*' })).map(tab => tab.id));
  const originalTabs = await worker.evaluate(async ids => {
    await chrome.tabs.group({ tabIds: ids[0] });
    return Promise.all(ids.map(id => chrome.tabs.get(id)));
  }, ids);
  ids = originalTabs.map(tab => tab.id);
  await popup.reload();
  await expect(popup.locator('#organiseStatus')).toContainText('0 of 2');
  await popup.getByRole('button', { name: 'Auto-prepare tabs', exact: true }).click();
  await expect.poll(() => context.pages().some(page => page.url().endsWith('/preparation/progress.html'))).toBe(true);
  const progress = context.pages().find(page => page.url().endsWith('/preparation/progress.html'));
  const sourceWindowId = await worker.evaluate(async id => (await chrome.tabs.get(id)).windowId, ids[1]);
  // Continue using the original window while the first video is elsewhere.
  await popup.bringToFront();
  await expect.poll(() => worker.evaluate(async id => (await chrome.tabs.get(id)).windowId, ids[0])).not.toBe(sourceWindowId);
  await expect(popup.locator('#tabsTable tbody tr')).toHaveCount(2);
  await expect(popup.locator('#backlogSummary')).toContainText('2 videos');
  await expect(popup.locator('#tabsTable')).toContainText('Auto-preparing…');
  await expect(popup.locator('#organisedBadge')).toBeHidden();
  const browsingOpened = context.waitForEvent('page');
  await worker.evaluate(windowId => chrome.tabs.create({ windowId, url: 'about:blank', active: true }), sourceWindowId);
  const browsing = await browsingOpened;
  await browsing.goto(`data:text/html,<video loop muted src="data:audio/wav;base64,${wav.toString('base64')}"></video><button onclick="document.querySelector('video').play();this.textContent=123">Play</button>`);
  await browsing.getByRole('button').click();
  await expect(browsing.getByRole('button')).toHaveText('123');
  await expect.poll(() => browsing.locator('video').evaluate(video => video.muted && !video.paused && video.readyState >= 2)).toBe(true);
  await expect.poll(() => popup.evaluate(async () =>
    (await chrome.runtime.sendMessage({ type: 'getAutoPreparation' })).autoPreparation,
  ), { timeout: 15000 }).toMatchObject({
    status: 'complete', total: 2, completed: 2, ready: 2, skipped: 0,
  });
  await expect.poll(() => progress.isClosed()).toBe(true);
  ids = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.youtube.com/*' })).sort((a, b) => a.index - b.index).map(tab => tab.id));
  expect(await worker.evaluate(async ids => (await Promise.all(ids.map(id => chrome.tabs.get(id)))).map(tab => tab.windowId), ids)).toEqual([sourceWindowId, sourceWindowId]);
  const returnedTabs = await worker.evaluate(async ids => Promise.all(ids.map(id => chrome.tabs.get(id))), ids);
  expect(returnedTabs.map(tab => tab.index)).toEqual(originalTabs.map(tab => tab.index));
  expect(returnedTabs[0].groupId).toBe(originalTabs[0].groupId);
  expect(await worker.evaluate(async windowId => (await chrome.tabs.query({ windowId, active: true }))[0].url, sourceWindowId)).toContain('data:text/html');
  await expect.poll(() => popup.evaluate(async ids => {
    const { windowId } = await chrome.tabs.get(ids[0]);
    const snapshot = await chrome.runtime.sendMessage({ type: 'getTabSnapshot', windowId });
    return ids.every(id => snapshot.tabRecordsById[id]?.videoDetails.remainingSeconds === 1 && !snapshot.tabRecordsById[id]?.remainingSecondsStale);
  }, ids)).toBe(true);
});

test('Stop returns a waiting preparation tab without changing the browsing selection', async ({ context, worker, extensionId }) => {
  await context.route('https://www.youtube.com/**', route => route.fulfill({
    contentType: 'text/html', body: '<title>Waiting video</title><video></video>',
  }));
  const firstStalled = await context.newPage();
  const secondStalled = await context.newPage();
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await firstStalled.goto('https://www.youtube.com/watch?v=stalled-one');
  await secondStalled.goto('https://www.youtube.com/watch?v=stalled-two');
  const stalledIds = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.youtube.com/watch?v=stalled-*' })).map(tab => tab.id));
  const originalTabs = await worker.evaluate(ids => Promise.all(ids.map(id => chrome.tabs.get(id))), stalledIds);
  await reopened.reload();
  await reopened.getByRole('button', { name: 'Auto-prepare tabs', exact: true }).click();
  await expect.poll(() => context.pages().some(page => page.url().endsWith('/preparation/progress.html'))).toBe(true);
  const stopWindow = context.pages().find(page => page.url().endsWith('/preparation/progress.html'));
  await expect.poll(() => worker.evaluate(async id => (await chrome.tabs.get(id)).active, stalledIds[0])).toBe(true);
  await stopWindow.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(stopWindow.getByRole('heading')).toHaveText('Auto-prepare stopped');
  const returned = await worker.evaluate(ids => Promise.all(ids.map(id => chrome.tabs.get(id))), stalledIds);
  expect(returned.map(tab => ({ active: tab.active, windowId: tab.windowId, index: tab.index })))
    .toEqual(originalTabs.map(tab => ({ active: false, windowId: tab.windowId, index: tab.index })));
});

test('preparation preserves first, middle and last positions in a multi-tab group', async ({ context, extensionId }) => {
  const testPage = await context.newPage();
  await testPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  const result = await testPage.evaluate(async () => {
    const { createPreparationWorkspace } = await import(chrome.runtime.getURL('background/auto-preparation/workspace.js'));
    const source = await chrome.windows.getLastFocused();
    const active = (await chrome.tabs.query({ windowId: source.id, active: true }))[0];
    const members = [];
    for (let i = 0; i < 3; i++) members.push(await chrome.tabs.create({ windowId: source.id, active: false, url: 'about:blank' }));
    const ids = members.map(tab => tab.id);
    const groupId = await chrome.tabs.group({ tabIds: ids });
    const original = await Promise.all(ids.map(id => chrome.tabs.get(id)));
    const workspace = createPreparationWorkspace();
    await workspace.create(source.id);
    const rounds = [];
    for (const position of [1, 0, 2]) {
      await workspace.moveTabToPreparationWindow(ids[position], source.id);
      await workspace.returnTab();
      const returned = await Promise.all(ids.map(id => chrome.tabs.get(id)));
      rounds.push({
        order: returned.map(tab => tab.index),
        groups: returned.map(tab => tab.groupId),
        activeId: (await chrome.tabs.query({ windowId: source.id, active: true }))[0].id,
        placeholders: (await chrome.tabs.query({ windowId: source.id })).filter(tab => tab.url.includes('/placeholder.html')).length,
      });
    }
    await workspace.finishSession();
    return { rounds, indices: original.map(tab => tab.index), groupId, activeId: active.id };
  });
  for (const round of result.rounds) {
    expect(round.order).toEqual(result.indices);
    expect(round.groups).toEqual([result.groupId, result.groupId, result.groupId]);
    expect(round.activeId).toBe(result.activeId);
    expect(round.placeholders).toBe(0);
  }
});
