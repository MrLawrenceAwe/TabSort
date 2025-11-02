import { setupOptionControls } from './options.js';
import { requestAndRenderSnapshot, renderSnapshot } from './render.js';
import { refreshActiveContext, sendMessageWithWindow } from './runtime.js';

export async function initialisePopup() {
  await refreshActiveContext().catch(() => null);
  await setupOptionControls().catch(() => null);
  await requestAndRenderSnapshot();

  const messageListener = (msg) => {
    if (msg?.message === 'tabRecordsUpdated' && msg.payload) {
      Promise.resolve(renderSnapshot(msg.payload)).catch(() => {});
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
