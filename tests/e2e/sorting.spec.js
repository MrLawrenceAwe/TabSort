import { expect, test } from './fixtures/extension.js';

test('sorting keeps existing groups and their appearance while reordering their members', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  const result = await page.evaluate(async () => {
    const { moveTabsInOrder } = await import(chrome.runtime.getURL('background/tabs/chrome-tabs.js'));
    const { keepTabGroupsTogether } = await import(chrome.runtime.getURL('background/sorting/move-order.js'));
    const window = await chrome.windows.create({ url: 'about:blank', focused: false });
    const pinned = window.tabs[0];
    await chrome.tabs.update(pinned.id, { pinned: true });
    const ids = [];
    for (let i = 0; i < 6; i++) {
      ids.push((await chrome.tabs.create({ windowId: window.id, url: 'about:blank', active: false })).id);
    }
    const firstGroup = await chrome.tabs.group({ tabIds: ids.slice(0, 3), createProperties: { windowId: window.id } });
    const secondGroup = await chrome.tabs.group({ tabIds: ids.slice(4), createProperties: { windowId: window.id } });
    await chrome.tabGroups.update(firstGroup, { title: 'My videos', color: 'blue', collapsed: true });
    await chrome.tabGroups.update(secondGroup, { title: 'Other tabs', color: 'red' });
    const before = await chrome.tabs.query({ windowId: window.id, pinned: false });
    const order = keepTabGroupsTogether([ids[5], ids[2], ids[3], ids[0], ids[4], ids[1]], before);
    const outcome = await moveTabsInOrder(order, 1, before);
    const after = await chrome.tabs.query({ windowId: window.id });
    const repeat = await moveTabsInOrder(order, 1, after.filter(tab => !tab.pinned));
    const groups = await Promise.all([firstGroup, secondGroup].map(id => chrome.tabGroups.get(id)));
    await chrome.windows.remove(window.id);
    return { outcome, repeat, order, actual: after.filter(tab => !tab.pinned).map(tab => tab.id),
      preserved: before.every(tab => after.find(item => item.id === tab.id)?.groupId === tab.groupId),
      pinned: after[0].id === pinned.id && after[0].pinned, groups };
  });
  expect(result.outcome.ok).toBe(true);
  expect(result.actual).toEqual(result.order);
  expect(result.preserved).toBe(true);
  expect(result.pinned).toBe(true);
  expect(result.groups[0]).toMatchObject({ title: 'My videos', color: 'blue', collapsed: true });
  expect(result.groups[1]).toMatchObject({ title: 'Other tabs', color: 'red' });
  expect(result.repeat).toMatchObject({ ok: true, orderChanged: false });
});
