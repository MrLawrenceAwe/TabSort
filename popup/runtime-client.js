import { POPUP_LOG_LEVELS } from '../shared/log-levels.js';
import { toErrorMessage } from '../shared/errors.js';
import { createRuntimeMessage, RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';

export function createRuntimeClient({
  getActiveWindowId,
  setActiveWindowId,
} = {}) {
  function postRuntimeMessage(type, data = {}, callback) {
    const message = createRuntimeMessage(type, data);
    const activeWindowId = getActiveWindowId?.();
    if (typeof activeWindowId === 'number' && message.windowId == null) {
      message.windowId = activeWindowId;
    }
    if (typeof callback === 'function') {
      return chrome.runtime.sendMessage(message, callback);
    }
    return chrome.runtime.sendMessage(message);
  }

  function requestRuntimeMessage(type, data = {}) {
    return new Promise((resolve, reject) => {
      postRuntimeMessage(type, data, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(runtimeError);
          return;
        }
        resolve(response);
      });
    });
  }

  function logPopupMessage(type = POPUP_LOG_LEVELS.ERROR, message = 'Message is undefined') {
    const logger = type === POPUP_LOG_LEVELS.ERROR ? 'error' : 'log';
    console[logger](`[Popup] ${message}`);
    postRuntimeMessage(RUNTIME_MESSAGE_TYPES.LOG_POPUP_MESSAGE, { level: type, text: message });
  }

  function logPopupError(context, error) {
    const message = toErrorMessage(error);
    if (message === 'No active tab') {
      console.debug(`[Popup] ${context}: ${message}`);
      return;
    }
    logPopupMessage(POPUP_LOG_LEVELS.ERROR, `${context}: ${message}`);
  }

  function syncActiveWindow() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          setActiveWindowId?.(null);
          reject(runtimeError);
          return;
        }
        if (tabs && tabs.length) {
          const tab = tabs[0];
          const windowId = typeof tab.windowId === 'number' ? tab.windowId : null;
          setActiveWindowId?.(windowId);
          resolve({ tabId: tab.id, windowId });
          return;
        }
        setActiveWindowId?.(null);
        reject(new Error('No active tab'));
      });
    });
  }

  return {
    logPopupError,
    logPopupMessage,
    postRuntimeMessage,
    requestRuntimeMessage,
    syncActiveWindow,
  };
}
