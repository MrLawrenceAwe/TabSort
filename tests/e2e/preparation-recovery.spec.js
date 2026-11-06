import { expect, test } from './fixtures/extension.js';

async function startWaitingVideo({ context, worker, extensionId }) {
  // One lightweight video page, with no source, playback or external requests.
  await context.route('https://www.youtube.com/**', route => route.fulfill({
    contentType: 'text/html', body: '<title>Waiting video</title><video></video>',
  }));
  const video = await context.newPage();
  await video.goto('https://www.youtube.com/watch?v=recovery-regression');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  const original = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://www.youtube.com/watch?v=recovery-regression' });
    const groupId = await chrome.tabs.group({ tabIds: tab.id });
    await chrome.tabGroups.update(groupId, { title: 'Recovery videos', color: 'blue' });
    return chrome.tabs.get(tab.id);
  });
  await popup.reload();
  await popup.getByRole('button', { name: 'Auto-prepare tabs', exact: true }).click();
  await expect.poll(() => worker.evaluate(async original => {
    const tab = await chrome.tabs.get(original.id);
    return tab.active && tab.windowId !== original.windowId;
  }, original)).toBe(true);
  return { popup, original };
}

test('pinning a grouped preparation video preserves the pin when the video returns', async ({ context, worker, extensionId }) => {
  const { popup, original } = await startWaitingVideo({ context, worker, extensionId });
  await worker.evaluate(id => chrome.tabs.update(id, { pinned: true }), original.id);
  await expect.poll(() => popup.evaluate(async () =>
    (await chrome.runtime.sendMessage({ type: 'getAutoPreparation' })).autoPreparation.status,
  )).toBe('complete');
  const returned = await worker.evaluate(id => chrome.tabs.get(id), original.id);
  expect(returned).toMatchObject({ windowId: original.windowId, pinned: true, groupId: -1, index: 0, active: false });
  expect(await popup.evaluate(async () => ({
    journal: (await chrome.storage.local.get('autoPreparationWorkspace')).autoPreparationWorkspace ?? null,
    placeholders: (await chrome.tabs.query({})).filter(tab => tab.url.includes('/preparation/placeholder.html')).length,
  }))).toEqual({ journal: null, placeholders: 0 });
});

test('worker restart recovers after session storage and the placeholder are lost', async ({ context, worker, extensionId }) => {
  const { popup, original } = await startWaitingVideo({ context, worker, extensionId });
  await expect.poll(() => popup.evaluate(() => chrome.action.getBadgeText({}))).toBe('1/1');
  await popup.evaluate(async () => {
    await chrome.storage.session.clear();
    const placeholders = (await chrome.tabs.query({})).filter(tab =>
      tab.url.includes('/preparation/placeholder.html'));
    await chrome.tabs.remove(placeholders.map(tab => tab.id));
  });
  const cdp = await context.newCDPSession(popup);
  const versions = [];
  cdp.on('ServiceWorker.workerVersionUpdated', event => versions.push(...event.versions));
  try {
    await cdp.send('ServiceWorker.enable');
    await expect.poll(() => versions.some(version => version.scriptURL ===
      `chrome-extension://${extensionId}/background/service-worker.js`)).toBe(true);
    const version = versions.filter(version => version.scriptURL ===
      `chrome-extension://${extensionId}/background/service-worker.js`).at(-1);
    await cdp.send('ServiceWorker.stopWorker', { versionId: version.versionId });
  } finally {
    await cdp.detach();
  }
  // Query through the popup: the original worker object was terminated.
  await expect.poll(() => popup.evaluate(async tabId => ({
    state: (await chrome.runtime.sendMessage({ type: 'getAutoPreparation' })).autoPreparation.status,
    badge: await chrome.action.getBadgeText({}),
    title: await chrome.action.getTitle({}),
    tab: await chrome.tabs.get(tabId),
    group: (await chrome.tabs.get(tabId)).groupId >= 0
      ? await chrome.tabGroups.get((await chrome.tabs.get(tabId)).groupId) : null,
    journal: (await chrome.storage.local.get('autoPreparationWorkspace')).autoPreparationWorkspace ?? null,
  }), original.id)).toMatchObject({
    state: 'idle', badge: '', title: 'TabSort', journal: null,
    tab: { id: original.id, windowId: original.windowId, index: original.index, active: false },
    group: { title: 'Recovery videos', color: 'blue' },
  });
});
