import { createAsyncResponder } from './async-responder.js';
import { activateTab, reloadTab } from './handlers/tab-actions.js';
import {
  handleContentScriptReady,
  handleMetadataLoaded,
  handleTabDetailsHint,
} from './handlers/content-script.js';
import {
  handleGetCurrentSnapshot,
  handleGetTabSnapshot,
  handleSortTrackedTabs,
  handleSyncTrackedTabs,
} from './handlers/popup-handlers.js';

export function registerRuntimeMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message?.action || message?.message;
    const respondAsync = createAsyncResponder(sendResponse);

    const handlers = {
      syncTrackedTabs: () => handleSyncTrackedTabs(message),
      getTabSnapshot: () => handleGetTabSnapshot(message),
      getCurrentSnapshot: () => handleGetCurrentSnapshot(message),
      sortTrackedTabs: () => handleSortTrackedTabs(message),
      ping: async () => ({ ok: true }),
      activateTab: () => activateTab(message),
      reloadTab: () => reloadTab(message),
      logPopupMessage: async () => {
        const level = message.type === 'error' ? 'error' : 'log';
        console[level](`[Popup] ${message.info}`);
      },
      contentScriptReady: () => handleContentScriptReady(message, sender),
      metadataLoaded: () => handleMetadataLoaded(message, sender),
      tabDetailsHint: () => handleTabDetailsHint(message, sender),
    };

    if (handlers[type]) {
      return respondAsync(handlers[type], type);
    }
    return false;
  });
}
