import { MESSAGE_TYPES } from '../shared/constants.js';
import { popupState, setActiveWindowId } from './state.js';

export function refreshActiveContext() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const err = chrome.runtime.lastError;
      if (err) {
        setActiveWindowId(null);
        reject(err);
        return;
      }
      if (tabs && tabs.length) {
        const tab = tabs[0];
        setActiveWindowId(typeof tab.windowId === 'number' ? tab.windowId : null);
        resolve({ tabId: tab.id, windowId: popupState.activeWindowId });
        return;
      }
      setActiveWindowId(null);
      reject(new Error('No active tab'));
    });
  });
}

export function sendMessageWithWindow(action, data = {}, callback) {
  const message = { action, ...data };
  if (typeof popupState.activeWindowId === 'number' && message.windowId == null) {
    message.windowId = popupState.activeWindowId;
  }
  if (typeof callback === 'function') {
    return chrome.runtime.sendMessage(message, callback);
  }
  return chrome.runtime.sendMessage(message);
}

export function logAndSend(type = MESSAGE_TYPES.ERROR, message = 'Message is undefined') {
  const logger = type === MESSAGE_TYPES.ERROR ? 'error' : 'log';
  console[logger](`[Popup] ${message}`);
  sendMessageWithWindow('logPopupMessage', { type, info: message });
}
