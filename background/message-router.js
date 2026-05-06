import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import {
  activateTab,
  applyTabSortOrder,
  getWindowSnapshot,
  reloadTab,
  syncWindowTabs,
} from './tab-command-handlers.js';
import {
  applyPageVideoDetails,
  markPageMediaReady,
  markPageRuntimeReady,
} from './page-message-handlers.js';

function createAsyncResponder(sendResponse) {
  return (fn, label) => {
    Promise.resolve()
      .then(() => fn())
      .then((result) => {
        sendResponse(result !== undefined ? result : { ok: true });
      })
      .catch((error) => {
        const messageText = error?.message || String(error);
        console.error(`[TabSort] handler "${label}" failed: ${messageText}`);
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  };
}

export function registerMessageRouter() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = message?.type;
    const respondAsync = createAsyncResponder(sendResponse);

    const handlers = {
      [RUNTIME_MESSAGE_TYPES.SYNC_TRACKED_TABS]: () => syncWindowTabs(message),
      [RUNTIME_MESSAGE_TYPES.GET_TAB_SNAPSHOT]: () => getWindowSnapshot(message),
      [RUNTIME_MESSAGE_TYPES.REORDER_WINDOW_TABS]: () => applyTabSortOrder(message),
      [RUNTIME_MESSAGE_TYPES.PING]: async () => ({ ok: true }),
      [RUNTIME_MESSAGE_TYPES.ACTIVATE_TAB]: () => activateTab(message),
      [RUNTIME_MESSAGE_TYPES.RELOAD_TAB]: () => reloadTab(message),
      [RUNTIME_MESSAGE_TYPES.LOG_POPUP_MESSAGE]: async () => {
        const level = message.level === 'error' ? 'error' : 'log';
        console[level](`[Popup] ${message.text}`);
      },
      [RUNTIME_MESSAGE_TYPES.PAGE_RUNTIME_READY]: () => markPageRuntimeReady(message, sender),
      [RUNTIME_MESSAGE_TYPES.PAGE_MEDIA_READY]: () => markPageMediaReady(message, sender),
      [RUNTIME_MESSAGE_TYPES.PAGE_VIDEO_DETAILS]: () => applyPageVideoDetails(message, sender),
    };

    if (handlers[type]) {
      return respondAsync(handlers[type], type);
    }
    return false;
  });
}
