// Serialized by chrome.scripting: keep every dependency inside this function.
export function controlSilentPlayback(videoId, token, operation) {
  const key = '__tabSortSilentPreparation';
  const store = globalThis[key] ??= { current: null, cancelled: new Set() };
  if (operation === 'stop') {
    store.cancelled.add(token);
    if (store.current?.token === token) store.current.finish(false);
    return false;
  }
  if (store.cancelled.has(token)) return false;
  const url = new URL(location.href);
  const currentId = url.pathname.startsWith('/shorts/')
    ? url.pathname.split('/')[2] : url.searchParams.get('v');
  if (currentId !== videoId) return false;
  const video = document.querySelector('#movie_player video') || document.querySelector('video');
  if (!video) return false;
  if (store.current?.token === token && store.current.video === video) {
    return store.current.ready;
  }
  store.current?.finish(false);
  const originalMuted = video.muted;
  let timer;
  let finished = false;
  const session = { token, video, ready: false, finish };
  store.current = session;
  function finish(ready) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    video.removeEventListener('playing', onPlaying);
    window.removeEventListener('pagehide', onCancelled);
    window.removeEventListener('yt-navigate-start', onCancelled);
    // Pause before restoring sound, including on Stop, rejection and timeout.
    video.pause();
    video.muted = originalMuted;
    session.ready = ready;
  }
  function onPlaying() { finish(true); }
  function onCancelled() { store.cancelled.add(token); finish(false); }
  video.addEventListener('playing', onPlaying);
  window.addEventListener('pagehide', onCancelled);
  window.addEventListener('yt-navigate-start', onCancelled);
  timer = setTimeout(() => finish(false), 10000);
  video.muted = true;
  try {
    // YouTube's Play action also applies its pending saved position. Starting
    // only the media element can leave the surrounding player uninitialized.
    if (video.paused) document.querySelector('#movie_player .ytp-play-button')?.click();
    if (finished) return session.ready;
    Promise.resolve(video.play()).then(() => {
      if (!finished) finish(true);
      // A pending play() may resolve after Stop. Pause it again, without
      // interfering with a newer preparation session using this element.
      else if (store.current === session) video.pause();
    }, () => finish(false));
  } catch {
    finish(false);
  }
  return session.ready;
}

export function createSilentPlaybackPreparation() {
  let current = null;
  const execute = (session, operation) => chrome.scripting.executeScript({
    target: { tabId: session.tabId },
    func: controlSilentPlayback,
    args: [session.videoId, session.token, operation],
  });
  return {
    async read(tabId, videoId, signal) {
      if (signal.aborted) return false;
      current ??= { tabId, videoId, token: crypto.randomUUID() };
      const session = current;
      if (session.tabId !== tabId || session.videoId !== videoId) return false;
      let timer;
      let onAbort;
      let expired = false;
      try {
        const pending = execute(session, 'start').then(result => {
          if (expired || signal.aborted || current !== session) {
            void execute(session, 'stop').catch(() => {});
            return false;
          }
          return result?.[0]?.result === true;
        });
        return await Promise.race([
          pending,
          new Promise(resolve => { timer = setTimeout(() => resolve(false), 2000); }),
          new Promise(resolve => {
            onAbort = () => resolve(false);
            signal.addEventListener('abort', onAbort, { once: true });
            if (signal.aborted) onAbort();
          }),
        ]);
      } finally {
        expired = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
      }
    },
    async stop() {
      const session = current;
      current = null;
      if (session) {
        let timer;
        try {
          await Promise.race([
            execute(session, 'stop').catch(() => {}),
            new Promise(resolve => { timer = setTimeout(resolve, 2000); }),
          ]);
        } finally { clearTimeout(timer); }
      }
    },
    replaceTabId(addedTabId, removedTabId) {
      if (current?.tabId === removedTabId) current.tabId = addedTabId;
    },
  };
}
