(function () {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.id) return;

  const MAX_BOOTSTRAP_ATTEMPTS = 2;
  const RETRY_DELAY_MS = 100;

  async function bootstrapYoutubePageSessionWithRetry() {
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_BOOTSTRAP_ATTEMPTS; attempt += 1) {
      try {
        const module = await import(runtime.getURL('content/youtube/youtube-page-session.js'));
        if (typeof module?.bootstrapYoutubePageSession === 'function') {
          module.bootstrapYoutubePageSession();
        }
        return;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_BOOTSTRAP_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }
    if (lastError) {
      const message = lastError instanceof Error ? lastError.message : String(lastError);
      console.warn(`[TabSort] Failed to bootstrap content script: ${message}`);
    }
  }

  bootstrapYoutubePageSessionWithRetry();
})();
