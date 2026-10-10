import { createPreviewChrome } from './preview-fixture.js';

try {
  const response = await fetch('../popup/popup.html');
  if (!response.ok) throw new Error(`Popup markup request failed (${response.status})`);
  const popupDocument = new DOMParser().parseFromString(await response.text(), 'text/html');
  document.body.appendChild(popupDocument.querySelector('main'));
  globalThis.chrome = createPreviewChrome();
  await import('../popup/controller.js');
} catch (error) {
  const message = document.createElement('p');
  message.textContent = `Could not load the popup preview: ${error.message}`;
  document.body.appendChild(message);
}
