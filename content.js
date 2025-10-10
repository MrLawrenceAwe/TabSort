(function () {
  function isoToSeconds(iso) {
    if (!iso) return null;
    const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (!m) return null;
    const h = parseFloat(m[1] || 0), mn = parseFloat(m[2] || 0), s = parseFloat(m[3] || 0);
    return h * 3600 + mn * 60 + s;
  }
  const getVideoEl = () => document.querySelector('video');

  function parseYtInitialPlayerResponse() {
    let obj = null;
    try { if (window.ytInitialPlayerResponse) obj = window.ytInitialPlayerResponse; } catch (_) {}
    if (!obj) {
      const script = [...document.scripts].find(s => s.textContent.includes('ytInitialPlayerResponse'));
      if (script) {
        const m = script.textContent.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\})\s*;/s);
        if (m) { try { obj = JSON.parse(m[1]); } catch (_) {} }
      }
    }
    return obj || {};
  }

  function getLightweightDetails() {
    const title =
      document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector('meta[itemprop="name"]')?.content ||
      document.title || null;

    let lengthSeconds = isoToSeconds(
      document.querySelector('meta[itemprop="duration"]')?.getAttribute('content')
    );

    let isLive = false;

    if (lengthSeconds == null) {
      const yipr = parseYtInitialPlayerResponse();
      const ls = yipr?.videoDetails?.lengthSeconds;
      if (ls != null) lengthSeconds = Number(ls);
      if (yipr?.videoDetails?.isLiveContent === true ||
          yipr?.playabilityStatus?.liveStreamability ||
          yipr?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails) {
        isLive = true;
      }
    }

    if (lengthSeconds == null) isLive = true;

    return { title, lengthSeconds, isLive, url: location.href };
  }

  function sendLightweightDetails() {
    try {
      const d = getLightweightDetails();
      if (d.title || d.lengthSeconds != null) {
        chrome.runtime.sendMessage({ message: 'lightweightDetails', details: d });
      }
    } catch (_) {}
  }

  function sendContentReadyOnce() {
    if (sendContentReadyOnce._sent) return;
    sendContentReadyOnce._sent = true;
    try { chrome.runtime.sendMessage({ message: 'contentScriptReady' }, () => {}); } catch (_) {}
  }

  function attachVideoReadyListener() {
    const video = getVideoEl();
    if (!video) return false;

    const send = () => { chrome.runtime.sendMessage({ message: 'metadataLoaded' }); cleanup(); };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onAny);
      video.removeEventListener('loadeddata', onAny);
      video.removeEventListener('durationchange', onAny);
      video.removeEventListener('canplay', onAny);
    };
    const onAny = () => send();

    if (video.readyState >= 2 && isFinite(video.duration)) {
      send();
    } else {
      video.addEventListener('loadedmetadata', onAny, { once: true });
      video.addEventListener('loadeddata', onAny, { once: true });
      video.addEventListener('durationchange', onAny, { once: true });
      video.addEventListener('canplay', onAny, { once: true });
    }
    return true;
  }

  function watchForVideoMount() {
    if (attachVideoReadyListener()) return;
    const obs = new MutationObserver(() => { if (attachVideoReadyListener()) obs.disconnect(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.message === 'getVideoMetrics') {
      const video = getVideoEl();
      const light = getLightweightDetails();
      const payload = {
        title: light.title || null,
        url: light.url,
        lengthSeconds: (typeof light.lengthSeconds === 'number' && isFinite(light.lengthSeconds)) ? light.lengthSeconds : null,
        isLive: Boolean(light.isLive),
        duration: (video && isFinite(video.duration)) ? video.duration : null,
        currentTime: (video && isFinite(video.currentTime)) ? video.currentTime : null,
        playbackRate: (video && isFinite(video.playbackRate) && video.playbackRate > 0) ? video.playbackRate : 1,
        paused: video ? video.paused : null,
      };
      sendResponse(payload);
      return true;
    }
    return false;
  });

  function initialise() {
    sendContentReadyOnce();
    sendLightweightDetails();
    watchForVideoMount();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') initialise();
  else window.addEventListener('DOMContentLoaded', initialise, { once: true });

  window.addEventListener('yt-navigate-finish', () => {
    sendLightweightDetails();
    watchForVideoMount();
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      sendContentReadyOnce();
      sendLightweightDetails();
      watchForVideoMount();
    }
  });
})();