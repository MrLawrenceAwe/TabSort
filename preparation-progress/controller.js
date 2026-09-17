import { formatPreparationCounts, formatPreparationDetail } from '../shared/auto-preparation.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
const progress = document.getElementById('progress');
const current = document.getElementById('current');
const stop = document.getElementById('stop');
function render(state) {
  const running = state.status === 'running';
  const heading = running ? 'Auto-preparing tabs' : state.status === 'complete' ? 'Auto-preparation finished' :
    state.status === 'stopped' ? state.reason : 'No auto-preparation running';
  document.querySelector('h1').textContent = heading;
  progress.textContent = formatPreparationCounts(state);
  current.textContent = running
    ? `${formatPreparationDetail(state)}${state.title ? ` · ${state.title}` : ''}`
    : '';
  stop.disabled = !running;
}
async function refresh() {
  try {
    const response = await chrome.runtime.sendMessage({ type: RUNTIME_MESSAGE_TYPES.GET_AUTO_PREPARATION });
    render(response.autoPreparation);
  } catch { progress.textContent = 'Could not connect to TabSort. Reopen the extension.'; }
}
stop.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: RUNTIME_MESSAGE_TYPES.STOP_AUTO_PREPARATION });
  await refresh();
});
chrome.runtime.onMessage.addListener(message => {
  if (message.type === RUNTIME_MESSAGE_TYPES.AUTO_PREPARATION_UPDATED && message.autoPreparation) {
    render(message.autoPreparation);
  }
});
void refresh();
const timer = setInterval(refresh, 1000);
window.addEventListener('unload', () => clearInterval(timer));
