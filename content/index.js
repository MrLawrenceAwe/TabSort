(function () {
  const sharedRuntime = {
    mediaReadyStateThreshold: 2,
    isFiniteNumber: (value) => typeof value === 'number' && Number.isFinite(value),
  };

  let sharedRuntimeReady = false;

  /**
   * Logs an error from the content script with context.
   * @param {string} context - Description of the operation that failed.
   * @param {Error|unknown} error - The error that occurred.
   * @see shared/utils.js - toErrorMessage (similar pattern)
   */
  const logContentError = (context, error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[TabSort] ${context}: ${message}`);
  };

  const hasRuntime = () => Boolean(chrome?.runtime?.id);

  async function loadSharedRuntime() {
    if (sharedRuntimeReady) return;
    sharedRuntimeReady = true;

    if (!hasRuntime()) return;

    try {
      const [constantsModule, utilsModule] = await Promise.all([
        import(chrome.runtime.getURL('shared/constants.js')),
        import(chrome.runtime.getURL('shared/utils.js')),
      ]);

      if (typeof constantsModule?.MEDIA_READY_STATE_THRESHOLD === 'number') {
        sharedRuntime.mediaReadyStateThreshold = constantsModule.MEDIA_READY_STATE_THRESHOLD;
      }
      if (typeof utilsModule?.isFiniteNumber === 'function') {
        sharedRuntime.isFiniteNumber = utilsModule.isFiniteNumber;
      }
    } catch (error) {
      logContentError('Loading shared runtime', error);
    }
  }

  const safeSendMessage = (payload, context) => {
    if (!hasRuntime()) return false;
    try {
      chrome.runtime.sendMessage(payload);
      return true;
    } catch (error) {
      if (context) logContentError(`Sending ${context}`, error);
      return false;
    }
  };

  const isoToSeconds = (iso) => {
    if (!iso) return null;
    const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (!m) return null;
    const h = parseFloat(m[1] || 0), mn = parseFloat(m[2] || 0), s = parseFloat(m[3] || 0);
    return h * 3600 + mn * 60 + s;
  };

  const getVideoEl = () => {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;
    if (videos.length === 1) return videos[0];

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    let best = videos[0];
    let bestArea = -1;
    for (const video of videos) {
      if (!(video instanceof HTMLVideoElement)) continue;
      const rect = video.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      const area = width * height;

      if (area > bestArea) {
        bestArea = area;
        best = video;
        continue;
      }

      if (area === bestArea && best && best.paused && !video.paused) {
        best = video;
      }
    }
    return best;
  };

  const cleanTitle = (raw) => {
    if (!raw) return null;
    const suffix = ' - YouTube';
    const trimmed = String(raw).trim();
    return trimmed.endsWith(suffix) ? trimmed.slice(0, -suffix.length) : trimmed;
  };

  // ============================================================
  // YouTube Player Response Parsing
  // ============================================================

  function extractYtInitialPlayerResponseFromScript(source) {
    if (typeof source !== 'string') return null;
    const identifier = 'ytInitialPlayerResponse';
    const idIndex = source.indexOf(identifier);
    if (idIndex === -1) return null;
    const equalsIndex = source.indexOf('=', idIndex);
    if (equalsIndex === -1) return null;
    let start = source.indexOf('{', equalsIndex);
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < source.length; i += 1) {
      const char = source[i];

      if (inString) {
        if (escape) {
          escape = false;
        } else if (char === '\\') {
          escape = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const jsonText = source.slice(start, i + 1);
          try {
            return JSON.parse(jsonText);
          } catch (error) {
            logContentError('Parsing inline ytInitialPlayerResponse', error);
            return null;
          }
        }
      }
    }

    return null;
  }

  function parseYtInitialPlayerResponse() {
    let obj = null;
    try {
      if (window.ytInitialPlayerResponse) obj = window.ytInitialPlayerResponse;
    } catch (error) {
      logContentError('Reading window.ytInitialPlayerResponse', error);
    }
    if (!obj) {
      const script = Array.from(document.scripts || []).find((s) =>
        s?.textContent?.includes('ytInitialPlayerResponse'),
      );
      if (script?.textContent) {
        const parsed = extractYtInitialPlayerResponseFromScript(script.textContent);
        if (parsed) obj = parsed;
      }
    }
    return obj || {};
  }

  // ============================================================
  // Video Details Extraction
  // ============================================================

  function getLightweightDetails() {
    const docTitle = cleanTitle(document.title);
    const ogTitle = cleanTitle(document.querySelector('meta[property="og:title"]')?.content);
    const itempropTitle = cleanTitle(document.querySelector('meta[itemprop="name"]')?.content);
    const yipr = parseYtInitialPlayerResponse();

    let title = docTitle || ogTitle || itempropTitle || cleanTitle(yipr?.videoDetails?.title) || null;

    let lengthSeconds = isoToSeconds(
      document.querySelector('meta[itemprop="duration"]')?.getAttribute('content')
    );

    const isLiveBroadcastMeta = (
      document.querySelector('meta[itemprop="isLiveBroadcast"]')?.getAttribute('content') || ''
    ).toLowerCase() === 'true';
    const isLive =
      isLiveBroadcastMeta ||
      yipr?.videoDetails?.isLiveContent === true ||
      yipr?.videoDetails?.isLive === true ||
      Boolean(yipr?.playabilityStatus?.liveStreamability) ||
      Boolean(yipr?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails);

    if (lengthSeconds == null) {
      const ls = yipr?.videoDetails?.lengthSeconds;
      if (ls != null) lengthSeconds = Number(ls);
    }

    return { title, lengthSeconds, isLive, url: location.href };
  }

  function sendLightweightDetails() {
    try {
      const d = getLightweightDetails();
      if (d.title || d.lengthSeconds != null || d.isLive) {
        safeSendMessage({ message: 'lightweightDetails', details: d }, 'lightweight details');
      }
    } catch (error) {
      logContentError('Sending lightweight details', error);
    }
  }

  // ============================================================
  // Content Script Lifecycle
  // ============================================================

  function sendContentReadyOnce() {
    if (sendContentReadyOnce._sent) return;
    sendContentReadyOnce._sent = true;
    safeSendMessage({ message: 'contentScriptReady' }, 'content script ready');
  }

  // ============================================================
  // Video Element Observation
  // ============================================================

  function attachVideoReadyListener() {
    const video = getVideoEl();
    if (!video) return false;

    const events = ['loadedmetadata', 'loadeddata', 'durationchange', 'canplay'];
    const send = () => { safeSendMessage({ message: 'metadataLoaded' }, 'metadata loaded'); cleanup(); };
    const cleanup = () => {
      events.forEach(evt => video.removeEventListener(evt, onAny));
    };
    const onAny = () => send();

    if (
      video.readyState >= sharedRuntime.mediaReadyStateThreshold &&
      sharedRuntime.isFiniteNumber(video.duration)
    ) {
      send();
    } else {
      events.forEach(evt => video.addEventListener(evt, onAny, { once: true }));
    }
    return true;
  }

  function watchForVideoMount() {
    if (attachVideoReadyListener()) return;
    const obs = new MutationObserver(() => { if (attachVideoReadyListener()) obs.disconnect(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ============================================================
  // Title Observation
  // ============================================================

  let titleElementObserver = null;
  let titleTextObserver = null;
  let observedTitleElement = null;
  let lastKnownTitleText = null;

  function observeTitleElement(titleEl) {
    if (!titleEl || titleEl === observedTitleElement) return;
    const shouldSendUpdate = observedTitleElement !== null;
    observedTitleElement = titleEl;
    lastKnownTitleText = titleEl.textContent;

    if (titleTextObserver) titleTextObserver.disconnect();
    titleTextObserver = new MutationObserver(() => {
      const nextTitle = titleEl.textContent;
      if (nextTitle === lastKnownTitleText) return;
      lastKnownTitleText = nextTitle;
      sendLightweightDetails();
    });
    titleTextObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });

    if (shouldSendUpdate) {
      sendLightweightDetails();
    }
  }

  function watchTitleChanges() {
    observeTitleElement(document.querySelector('title'));
    if (titleElementObserver) return;
    const target = document.head || document.documentElement;
    if (!target) return;
    titleElementObserver = new MutationObserver(() => {
      observeTitleElement(document.querySelector('title'));
    });
    titleElementObserver.observe(target, { childList: true, subtree: true });
  }

  // ============================================================
  // Message Handler
  // ============================================================

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.message === 'getVideoMetrics') {
      const video = getVideoEl();
      const light = getLightweightDetails();
      const payload = {
        title: light.title || null,
        url: light.url,
        lengthSeconds: sharedRuntime.isFiniteNumber(light.lengthSeconds) ? light.lengthSeconds : null,
        isLive: Boolean(light.isLive),
        duration:
          video && sharedRuntime.isFiniteNumber(video.duration) ? video.duration : null,
        currentTime:
          video && sharedRuntime.isFiniteNumber(video.currentTime) ? video.currentTime : null,
        playbackRate:
          video &&
          sharedRuntime.isFiniteNumber(video.playbackRate) &&
          video.playbackRate > 0
            ? video.playbackRate
            : 1,
        paused: video ? video.paused : null,
      };
      sendResponse(payload);
      return true;
    }
    return false;
  });

  // ============================================================
  // Initialization
  // ============================================================

  function refreshMetadata(includeReadySignal = false) {
    if (includeReadySignal) {
      sendContentReadyOnce();
    }
    sendLightweightDetails();
    watchForVideoMount();
    watchTitleChanges();
  }

  function initialise() {
    refreshMetadata(true);
  }

  loadSharedRuntime();

  if (document.readyState === 'complete' || document.readyState === 'interactive') initialise();
  else window.addEventListener('DOMContentLoaded', initialise, { once: true });

  window.addEventListener('yt-navigate-finish', () => {
    refreshMetadata();
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      refreshMetadata(true);
    }
  });

  // Cleanup observers on page unload to prevent memory leaks
  window.addEventListener('pagehide', () => {
    if (titleElementObserver) {
      titleElementObserver.disconnect();
      titleElementObserver = null;
    }
    if (titleTextObserver) {
      titleTextObserver.disconnect();
      titleTextObserver = null;
    }
    observedTitleElement = null;
    lastKnownTitleText = null;
  });
})();
