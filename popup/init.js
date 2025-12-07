import { MESSAGE_TYPES } from '../shared/constants.js';
import { toErrorMessage } from '../shared/utils.js';
import { setupOptionControls } from './options.js';
import { requestAndRenderSnapshot, renderSnapshot } from './render.js';
import { refreshActiveContext, sendMessageWithWindow, logAndSend } from './runtime.js';
import { initializeDomCache } from './dom-utils.js';

/**
 * Logs an error from the popup, handling "No active tab" specially.
 * @param {string} context - Description of the operation that failed.
 * @param {Error|unknown} error - The error that occurred.
 */
function logPopupError(context, error) {
  const message = toErrorMessage(error);
  if (message === 'No active tab') {
    console.debug(`[Popup] ${context}: ${message}`);
    return;
  }
  logAndSend(MESSAGE_TYPES.ERROR, `${context}: ${message}`);
}

/**
 * Safely executes an async function and logs errors with context.
 * @param {() => Promise<T>} fn - The async function to execute.
 * @param {string} context - Description of the operation for error logging.
 * @returns {Promise<T|null>} The result of the function, or null if it failed.
 * @template T
 */
async function safeAsync(fn, context) {
  try {
    return await fn();
  } catch (error) {
    logPopupError(context, error);
    return null;
  }
}

/**
 * Initializes the popup UI, setting up event listeners and rendering initial state.
 */
export async function initialisePopup() {
  // Initialize DOM cache early for performance
  initializeDomCache();

  await safeAsync(refreshActiveContext, 'Failed to refresh active context');
  await safeAsync(setupOptionControls, 'Failed to set up option controls');
  await safeAsync(requestAndRenderSnapshot, 'Failed to request initial snapshot');

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
