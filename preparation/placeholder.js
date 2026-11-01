import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
const button = document.getElementById('return');
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: RUNTIME_MESSAGE_TYPES.STOP_AND_RETURN_PREPARATION_VIDEO });
    if (!response?.ok) throw new Error(response?.error || 'Could not return the video.');
  } catch {
    document.getElementById('status').textContent = 'Could not return the video. It may still be in the preparation window.';
    button.disabled = false;
  }
});
