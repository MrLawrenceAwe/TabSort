import { createAsyncResponder } from './async-responder.js';
import { activateTab, reloadTab } from './handlers/tab-actions.js';
import {
  handlePageMediaReady,
  handlePageRuntimeReady,
  handlePageVideoDetails,
} from './handlers/content-script.js';
import {
  handleGetTabSnapshot,
  handleSortWindowTabs,
  handleSyncTrackedTabs,
} from './handlers/popup-handlers.js';

export function registerRuntimeMessageRouter() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message?.type;
    const respondAsync = createAsyncResponder(sendResponse);

    const handlers = {
      syncTrackedTabs: () => handleSyncTrackedTabs(message),
      getTabSnapshot: () => handleGetTabSnapshot(message),
      sortWindowTabs: () => handleSortWindowTabs(message),
      ping: async () => ({ ok: true }),
      activateTab: () => activateTab(message),
      reloadTab: () => reloadTab(message),
      logPopupMessage: async () => {
        const level = message.level === 'error' ? 'error' : 'log';
        console[level](`[Popup] ${message.text}`);
      },
      pageRuntimeReady: () => handlePageRuntimeReady(message, sender),
      pageMediaReady: () => handlePageMediaReady(message, sender),
      pageVideoDetails: () => handlePageVideoDetails(message, sender),
    };

    if (handlers[type]) {
      return respondAsync(handlers[type], type);
    }
    return false;
  });
}
