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
  const player = document.querySelector('#movie_player');
  const video = document.querySelector('ytd-reel-video-renderer[is-active] video') ||
    document.querySelector('#movie_player video') || document.querySelector('video');
  if (!video) return false;
  if (operation === 'metrics') {
    const data = player?.getVideoData?.();
    if (data?.video_id && data.video_id !== videoId) return null;
    if (player?.classList?.contains('ad-showing') || video.seeking || !video.paused ||
        video.readyState < 1 || !Number.isFinite(video.duration) || video.duration <= 0 ||
        !Number.isFinite(video.currentTime)) return null;
    return {
      url: location.href,
      title: data?.title || document.title.replace(/ - YouTube$/, ''),
      playbackMetricsReady: true,
      metadataDurationSeconds: video.duration,
      mediaDurationSeconds: video.duration,
      positionSeconds: video.currentTime,
      playbackRate: video.playbackRate || 1,
      isLive: data?.isLive === true,
    };
  }
  if (store.current?.token === token && store.current.video === video) {
    if (store.current.ready) return true;
    if (!store.current.finished) return false;
    // A failed play is not a permanent failure of this document. YouTube can
    // deliver its media after an interrupted play request or the watchdog.
    if (video.readyState >= 1 && Number.isFinite(video.duration) && !video.seeking) return true;
    if (Date.now() < store.current.retryAt) return false;
  }
  store.current?.finish(false);
  const originalMuted = typeof player?.isMuted === 'function' ? player.isMuted() : video.muted;
  let timer;
  let pauseTimer;
  let finished = false;
  const session = { token, video, ready: false, finished: false, retryAt: 0, finish };
  store.current = session;
  function finish(ready) {
    if (finished) return;
    finished = true;
    session.finished = true;
    session.retryAt = Date.now() + 1000;
    clearTimeout(timer);
    clearTimeout(pauseTimer);
    video.removeEventListener('playing', onPlaying);
    video.removeEventListener('loadedmetadata', onMediaReady);
    video.removeEventListener('canplay', onMediaReady);
    video.removeEventListener('seeked', onMediaReady);
    window.removeEventListener('pagehide', onCancelled);
    window.removeEventListener('yt-navigate-start', onCancelled);
    // Pause before restoring sound, including on Stop, rejection and timeout.
    player?.pauseVideo?.();
    video.pause();
    if (originalMuted) player?.mute?.();
    else player?.unMute?.();
    video.muted = originalMuted;
    session.ready = ready;
  }
  function onPlaying() {
    // Let YouTube complete its player transition before pausing. Pausing in
    // the playing event itself can interrupt its pending initialization.
    pauseTimer ??= setTimeout(() => finish(true), 250);
  }
  function onCancelled() { finish(false); }
  function playMedia() {
    try {
      // Autoplay extensions can replace HTMLVideoElement.prototype.play and
      // reject even an explicitly requested muted preparation. Use the browser
      // media method for this short, user-requested initialization only.
      Promise.resolve(HTMLMediaElement.prototype.play.call(video)).then(() => {
        if (!finished) onPlaying();
        else if (store.current === session) video.pause();
      }, error => {
        // YouTube can replace the media source while its Play action starts.
        // Retry on the new media's readiness events rather than latching failure.
        if (error?.name !== 'AbortError') finish(false);
      });
    } catch { finish(false); }
  }
  function onMediaReady() {
    if (finished || pauseTimer != null) return;
    // HAVE_METADATA provides the actual media duration and restored position.
    // Waiting for buffered frames can stall forever even though time is readable.
    if (video.readyState >= 1 && Number.isFinite(video.duration) &&
        video.duration > 0 && !video.seeking) onPlaying();
    else if (video.paused) playMedia();
  }
  video.addEventListener('playing', onPlaying);
  video.addEventListener('loadedmetadata', onMediaReady);
  video.addEventListener('canplay', onMediaReady);
  video.addEventListener('seeked', onMediaReady);
  window.addEventListener('pagehide', onCancelled);
  window.addEventListener('yt-navigate-start', onCancelled);
  timer = setTimeout(() => finish(false), 10000);
  video.muted = true;
  try {
    // YouTube's Play action also applies its pending saved position. Starting
    // only the media element can leave the surrounding player uninitialized.
    player?.mute?.();
    if (typeof player?.playVideo === 'function') {
      player.playVideo();
      if (!video.paused && video.readyState >= 2) onPlaying();
    } else if (video.paused) document.querySelector('#movie_player .ytp-play-button')?.click();
    if (finished || pauseTimer != null) return session.ready;
    // The player API may initialize metadata while leaving the media paused.
    // Start the muted element too, then allow its source transitions to settle.
    playMedia();
    if (video.readyState >= 1) onMediaReady();
  } catch {
    finish(false);
  }
  return session.ready;
}

export function createSilentPlaybackPreparation() {
  let current = null;
  const execute = (session, operation) => chrome.scripting.executeScript({
    target: { tabId: session.tabId },
    world: 'MAIN',
    func: controlSilentPlayback,
    args: [session.videoId, session.token, operation],
  });
  return {
    async read(tabId, videoId, signal, operation = 'start') {
      if (signal.aborted) return false;
      current ??= { tabId, videoId, token: crypto.randomUUID() };
      const session = current;
      if (session.tabId !== tabId || session.videoId !== videoId) return false;
      let timer;
      let onAbort;
      let expired = false;
      let settled = false;
      try {
        const pending = execute(session, operation).then(result => {
          settled = true;
          if (expired || signal.aborted || current !== session) {
            void execute(session, 'stop').catch(() => {});
            return false;
          }
          return operation === 'metrics' ? result?.[0]?.result || null : result?.[0]?.result === true;
        }).catch(() => { settled = true; return false; });
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
        if (!settled && current === session) {
          current = null;
          void execute(session, 'stop').catch(() => {});
        }
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
