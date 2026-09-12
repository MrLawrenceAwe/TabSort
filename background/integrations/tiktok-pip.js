const TIKTOK_PIP_EXTENSION_ID = 'cfjneijpfcflfdhikjdjihaddnbbkdnp';
const OPEN_FOR_PREPARATION = 'OPEN_FOR_TABSORT_PREPARATION';
const REQUEST_TIMEOUT_MS = 12000;

export function openTikTokPipForPreparation(windowId, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, error: 'requestTimedOut' }),
      timeoutMs,
    );

    try {
      chrome.runtime.sendMessage(
        TIKTOK_PIP_EXTENSION_ID,
        { type: OPEN_FOR_PREPARATION, windowId },
        (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            finish({ ok: false, error: 'extensionUnavailable' });
            return;
          }
          finish(response?.ok === true ? response : { ok: false, error: 'openFailed' });
        },
      );
    } catch {
      finish({ ok: false, error: 'extensionUnavailable' });
    }
  });
}
