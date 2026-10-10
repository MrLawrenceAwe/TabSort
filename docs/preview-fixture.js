import { deriveSortState } from '../background/sorting/derive-state.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';

export function createPreviewChrome() {
  const titles = ['JavaScript testing patterns', 'Building a useful browser extension', 'Managing background tasks'];
  const records = titles.map((title, index) => ({
    id: index + 1, index, windowId: 1,
    url: `https://www.youtube.com/watch?v=preview-${index + 1}`,
    loadState: index === 2 ? 'discarded' : 'loaded',
    contentScriptReady: true, remainingSecondsStale: index === 2,
    videoDetails: { title, remainingSeconds: index === 2 ? null : [420, 195][index] },
  }));
  const snapshot = {
    windowId: 1,
    tabRecordsById: Object.fromEntries(records.map(record => [record.id, record])),
    ...deriveSortState(records, { orderedWindowTabs: records }),
    autoPreparation: { status: 'idle' },
  };
  const preferences = {};
  return {
    runtime: {
      sendMessage: async ({ type }) => type === RUNTIME_MESSAGE_TYPES.GET_TAB_SNAPSHOT
        ? structuredClone(snapshot) : { ok: true },
      onMessage: { addListener() {}, removeListener() {} },
    },
    tabs: { query: async () => [{ id: 1, windowId: 1 }] },
    storage: { sync: {
      get: async defaults => ({ ...defaults, ...preferences }),
      set: async update => Object.assign(preferences, update),
    } },
  };
}
