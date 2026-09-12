const TIKTOK_PIP_EXTENSION_ID = 'cfjneijpfcflfdhikjdjihaddnbbkdnp';
const OPEN_FOR_AUTO_PREPARATION = 'OPEN_FOR_TABSORT_AUTO_PREPARATION';
const REQUEST_TIMEOUT_MS = 12000;

export async function openTikTokPipForAutoPreparation(windowId, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  let timer;
  try {
    return await Promise.race([
      chrome.runtime.sendMessage(TIKTOK_PIP_EXTENSION_ID, {
        type: OPEN_FOR_AUTO_PREPARATION, windowId,
      }).then(response => response?.ok === true ? response : { ok: false, error: 'openFailed' }),
      new Promise(resolve => {
        timer = setTimeout(() => resolve({ ok: false, error: 'requestTimedOut' }), timeoutMs);
      }),
    ]);
  } catch {
    return { ok: false, error: 'extensionUnavailable' };
  } finally {
    clearTimeout(timer);
  }
}
