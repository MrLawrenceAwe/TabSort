import { POPUP_LOG_LEVELS, toErrorMessage } from '../shared/log.js';
import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';

export function createRuntimeClient({
  getActiveWindowId,
  setActiveWindowId,
} = {}) {
  function requestRuntimeMessage(type, data = {}) {
    const message = createRuntimeMessage(type, data);
    const activeWindowId = getActiveWindowId?.();
    if (typeof activeWindowId === 'number' && message.windowId == null) {
      message.windowId = activeWindowId;
    }
    return chrome.runtime.sendMessage(message);
  }

  function logPopupMessage(type = POPUP_LOG_LEVELS.ERROR, message = 'Message is undefined') {
    const logger = type === POPUP_LOG_LEVELS.ERROR ? 'error' : 'log';
    console[logger](`[Popup] ${message}`);
    void requestRuntimeMessage(RUNTIME_MESSAGE_TYPES.LOG_POPUP_MESSAGE, { level: type, text: message })
      .catch(error => console.debug('[Popup] Could not forward log', error));
  }

  function logPopupError(context, error) {
    const message = toErrorMessage(error);
    if (message === 'No active tab') {
      console.debug(`[Popup] ${context}: ${message}`);
      return;
    }
    logPopupMessage(POPUP_LOG_LEVELS.ERROR, `${context}: ${message}`);
  }

  async function syncActiveWindow() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab');
      const windowId = typeof tab.windowId === 'number' ? tab.windowId : null;
      setActiveWindowId?.(windowId);
      return { tabId: tab.id, windowId };
    } catch (error) {
      setActiveWindowId?.(null);
      throw error;
    }
  }

  return {
    logPopupError,
    logPopupMessage,
    requestRuntimeMessage,
    syncActiveWindow,
  };
}
