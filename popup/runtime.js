import { MESSAGE_TYPES } from '../shared/constants.js';
import { popupStore, setActiveWindowId } from './popup-store.js';

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
        resolve({ tabId: tab.id, windowId: popupStore.activeWindowId });
        return;
      }
      setActiveWindowId(null);
      reject(new Error('No active tab'));
    });
  });
}

export function sendRuntimeMessage(type, data = {}, callback) {
  const message = { type, ...data };
  if (typeof popupStore.activeWindowId === 'number' && message.windowId == null) {
    message.windowId = popupStore.activeWindowId;
  }
  if (typeof callback === 'function') {
    return chrome.runtime.sendMessage(message, callback);
  }
  return chrome.runtime.sendMessage(message);
}

export function sendRuntimeMessageAsync(type, data = {}) {
  return new Promise((resolve, reject) => {
    sendRuntimeMessage(type, data, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(err);
        return;
      }
      resolve(response);
    });
  });
}

export function logAndSend(type = MESSAGE_TYPES.ERROR, message = 'Message is undefined') {
  const logger = type === MESSAGE_TYPES.ERROR ? 'error' : 'log';
  console[logger](`[Popup] ${message}`);
  sendRuntimeMessage('logPopupMessage', { level: type, text: message });
}
