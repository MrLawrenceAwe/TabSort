const params = new URLSearchParams(location.search);
const tabId = Number(params.get('tabId'));
const originalUrl = params.get('url');
const button = document.getElementById('return');
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: 'stopAutoPreparation' });
    let tab;
    try { tab = await chrome.tabs.get(tabId); } catch { /* Closed in the preparation window. */ }
    if (tab) {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
    } else if (originalUrl && /^https:\/\/(www\.)?youtube\.com\//.test(originalUrl)) {
      const current = await chrome.tabs.getCurrent();
      await chrome.tabs.update(current.id, { url: originalUrl });
    }
  } catch {
    document.getElementById('status').textContent = 'Could not return the video. It may still be in the preparation window.';
    button.disabled = false;
  }
});
