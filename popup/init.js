import { MESSAGE_TYPES } from '../shared/constants.js';
import { toErrorMessage } from '../shared/utils.js';
import { setupOptionControls } from './options.js';
import { requestAndRenderSnapshot, renderSnapshot } from './render.js';
import { refreshActiveContext, sendMessageWithWindow, logAndSend } from './runtime.js';
import { initializeDomCache } from './popup-layout.js';

function logPopupError(context, error) {
  const message = toErrorMessage(error);
  if (message === 'No active tab') {
    console.debug(`[Popup] ${context}: ${message}`);
    return;
  }
  logAndSend(MESSAGE_TYPES.ERROR, `${context}: ${message}`);
}

async function safeAsync(fn, context) {
  try {
    return await fn();
  } catch (error) {
    logPopupError(context, error);
    return null;
  }
}

export async function initializePopup() {
  initializeDomCache();

  await safeAsync(refreshActiveContext, 'Failed to refresh active context');
  await safeAsync(setupOptionControls, 'Failed to set up option controls');
  await safeAsync(requestAndRenderSnapshot, 'Failed to request initial snapshot');

  const messageListener = (message) => {
    if (message?.message === 'tabRecordsUpdated' && message.payload) {
      Promise.resolve(renderSnapshot(message.payload)).catch((error) => {
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

initializePopup().catch((error) => {
  logAndSend(MESSAGE_TYPES.ERROR, `Failed to initialize popup: ${toErrorMessage(error)}`);
});
