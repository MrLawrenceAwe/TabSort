import { MESSAGE_TYPES } from '../shared/constants.js';
import { toErrorMessage } from '../shared/errors.js';

export function createRuntimeClient({
  getActiveWindowId,
  setActiveWindowId,
} = {}) {
  function postRuntimeMessage(type, data = {}, callback) {
    const message = { type, ...data };
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

  function logPopupMessage(type = MESSAGE_TYPES.ERROR, message = 'Message is undefined') {
    const logger = type === MESSAGE_TYPES.ERROR ? 'error' : 'log';
    console[logger](`[Popup] ${message}`);
    postRuntimeMessage('logPopupMessage', { level: type, text: message });
  }

  function logPopupError(context, error) {
    const message = toErrorMessage(error);
    if (message === 'No active tab') {
      console.debug(`[Popup] ${context}: ${message}`);
      return;
    }
    logPopupMessage(MESSAGE_TYPES.ERROR, `${context}: ${message}`);
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
