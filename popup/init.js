import { MESSAGE_TYPES } from '../shared/constants.js';
import { setupOptionControls } from './options.js';
import { requestAndRenderSnapshot, renderSnapshot } from './render.js';
import { refreshActiveContext, sendMessageWithWindow, logAndSend } from './runtime.js';

function logPopupError(context, error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'No active tab') {
    console.debug(`[Popup] ${context}: ${message}`);
    return;
  }
  logAndSend(MESSAGE_TYPES.ERROR, `${context}: ${message}`);
}

export async function initialisePopup() {
  await refreshActiveContext().catch((error) => {
    logPopupError('Failed to refresh active context', error);
    return null;
  });
  await setupOptionControls().catch((error) => {
    logPopupError('Failed to set up option controls', error);
    return null;
  });
  await requestAndRenderSnapshot().catch((error) => {
    logPopupError('Failed to request initial snapshot', error);
  });

  const messageListener = (msg) => {
    if (msg?.message === 'tabRecordsUpdated' && msg.payload) {
      Promise.resolve(renderSnapshot(msg.payload)).catch((error) => {
        logPopupError('Failed to render incoming snapshot', error);
      });
    }
  };

  chrome.runtime.onMessage.addListener(messageListener);

  const sortButton = document.getElementById('sortButton');
  if (sortButton) {
    sortButton.addEventListener('click', () => sendMessageWithWindow('sortTabs'));
  }

  window.addEventListener('unload', () => {
    chrome.runtime.onMessage.removeListener(messageListener);
  });
}
