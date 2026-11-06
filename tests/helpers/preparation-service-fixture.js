import { resetTrackedWindowStore } from '../../background/windows/tracked-window-store.js';
import { createChromeTabFixture, ensureChromeApi } from './background-test-helpers.js';

export function createPreparationStorage(sessionValues = {}, journalValues = {}) {
  const area = values => ({
    get: async () => structuredClone(values),
    set: async updates => Object.assign(values, structuredClone(updates)),
    remove: async key => { delete values[key]; },
  });
  return { session: area(sessionValues), local: area(journalValues) };
}

export function createPreparationServiceFixture(count, onCreate = () => {}) {
  ensureChromeApi({ tabs: true });
  chrome.scripting = { executeScript: async options => [{ result:
    options.args?.[2] === 'metrics'
      ? await chrome.tabs.sendMessage(options.target.tabId).catch(() => null)
      : true,
  }] };
  resetTrackedWindowStore({ windowId: 1 });
  const tabs = new Map(Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return [id, createChromeTabFixture(id, { groupId: -1 })];
  }));
  const messages = [];
  const moves = [];
  let nextId = count + 1;
  chrome.runtime.getURL = path => `chrome-extension://test/${path}`;
  chrome.runtime.sendMessage = async message => { messages.push(structuredClone(message)); };
  const saved = {};
  const journal = {};
  chrome.storage = createPreparationStorage(saved, journal);
  chrome.tabs.query = async ({ windowId }) => [...tabs.values()].filter(tab => tab.windowId === windowId);
  chrome.tabs.get = async id => {
    if (!tabs.has(id)) throw new Error('No tab');
    return { ...tabs.get(id) };
  };
  chrome.tabs.create = async options => {
    const tab = { id: nextId++, index: tabs.size, groupId: -1, ...options };
    tabs.set(tab.id, tab);
    return { ...tab };
  };
  chrome.tabs.move = async (id, options) => {
    moves.push(id);
    return Object.assign(tabs.get(id), options, { active: false });
  };
  chrome.tabs.update = async (id, options) => Object.assign(tabs.get(id), options);
  chrome.tabs.remove = async id => { tabs.delete(id); };
  chrome.windows = { get: async id => ({ id }), create: async () => { onCreate(); return { id: 99 }; } };
  return { tabs, messages, moves, saved, journal };
}
