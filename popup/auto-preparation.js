import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
const progress = document.getElementById('progress');
const current = document.getElementById('current');
const stop = document.getElementById('stop');
function render(state) {
  const running = state.status === 'running';
  const heading = running ? 'Auto-preparing tabs' : state.status === 'complete' ? 'Auto-preparation finished' :
    state.status === 'stopped' ? state.reason : 'No auto-preparation running';
  document.querySelector('h1').textContent = heading;
  progress.textContent = `${state.completed} of ${state.total} checked · ${state.ready} ready · ${state.skipped} skipped`;
  current.textContent = running ? state.title || 'Starting…' : '';
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
  if (message.type === RUNTIME_MESSAGE_TYPES.TAB_SNAPSHOT_UPDATED && message.payload?.autoPreparation) {
    render(message.payload.autoPreparation);
  }
});
void refresh();
const timer = setInterval(refresh, 1000);
window.addEventListener('unload', () => clearInterval(timer));
