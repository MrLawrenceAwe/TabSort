import { createPreparationWorkspace } from '../../../background/auto-preparation/workspace.js';

chrome.runtime.onInstalled.addListener(() => run().then(
  result => report(result),
  error => report({ error: error.stack }),
));

async function report(result) {
  const response = await fetch(chrome.runtime.getURL('result-endpoint.json'));
  const { endpoint } = await response.json();
  await fetch(endpoint, { method: 'POST', body: JSON.stringify(result) });
}

async function run() {
  const source = await chrome.windows.create({ url: 'about:blank', focused: true });
  const activeId = source.tabs[0].id;
  const tabs = [];
  const waitLoaded = async id => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const tab = await chrome.tabs.get(id);
      if (!tab.discarded && tab.status === 'complete') return tab;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Tab did not wake: ' + id);
  };
  for (let i = 0; i < 5; i++) {
    tabs.push(await chrome.tabs.create({
      windowId: source.id, active: false,
      url: `data:text/html,<title>Sleeping ${i}</title><p>Discard test</p>`,
    }));
  }
  await Promise.all(tabs.map(tab => waitLoaded(tab.id)));
  const groupId = await chrome.tabs.group({ tabIds: tabs.map(tab => tab.id) });
  const original = [];
  for (const tab of tabs) original.push(await chrome.tabs.discard(tab.id));
  const workspace = createPreparationWorkspace();
  await workspace.create(source.id);
  const rounds = [];
  try {
    for (const tab of original) {
      await workspace.moveTabToPreparationWindow(tab.id, source.id);
      const awake = await waitLoaded(tab.id);
      await workspace.returnTab();
      const returned = await chrome.tabs.discard(tab.id);
      rounds.push({
        awake, returned, preparationFocused: (await chrome.windows.get(workspace.windowId)).focused,
      });
    }
  } finally {
    await workspace.finishSession();
  }
  const after = await chrome.tabs.query({ windowId: source.id });
  return {
    original, rounds, groupId, activeId, finalActiveId: after.find(tab => tab.active).id,
    placeholders: after.filter(tab => tab.url.includes('/placeholder.html')).length,
  };
}
