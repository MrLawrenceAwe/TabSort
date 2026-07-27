(() => {
  // shared/messages.js
  var RUNTIME_MESSAGE_TYPES = Object.freeze({
    OPEN_TAB: "openTab",
    COLLECT_VIDEO_METRICS: "collectVideoMetrics",
    GET_TAB_SNAPSHOT: "getTabSnapshot",
    LOG_POPUP_MESSAGE: "logPopupMessage",
    VIDEO_ELEMENT_READY: "videoElementReady",
    CONTENT_SCRIPT_READY: "contentScriptReady",
    PAGE_VIDEO_DETAILS: "pageVideoDetails",
    PING: "ping",
    RELOAD_TAB: "reloadTab",
    SORT_TABS: "sortTabs",
    SYNC_TRACKED_TABS: "syncTrackedTabs",
    TAB_SNAPSHOT_UPDATED: "tabSnapshotUpdated"
  });
  function createRuntimeMessage(type, data = {}) {
    return { type, ...data };
  }

  // shared/guards.js
  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }
  function toFiniteNumber(value) {
    if (value == null || value === "") return null;
    const numericValue = Number(value);
    return isFiniteNumber(numericValue) ? numericValue : null;
  }
  function toPositiveFiniteNumber(value) {
    const numericValue = toFiniteNumber(value);
    return numericValue != null && numericValue > 0 ? numericValue : null;
  }

  // content/youtube/metadata/player-response.js
  function extractInitialPlayerResponse(source) {
    if (typeof source !== "string") return null;
    const identifier = "ytInitialPlayerResponse";
    let searchIndex = 0;
    while (true) {
      const idIndex = source.indexOf(identifier, searchIndex);
      if (idIndex === -1) return null;
      searchIndex = idIndex + identifier.length;
      const equalsIndex = source.indexOf("=", idIndex);
      if (equalsIndex === -1) continue;
      const start = source.indexOf("{", equalsIndex);
      if (start === -1) continue;
      let depth = 0;
      let inString = false;
      let escape = false;
      let quoteChar = "";
      let parsedSuccessfully = false;
      let parsedResult = null;
      for (let i = start; i < source.length; i += 1) {
        const char = source[i];
        if (inString) {
          if (escape) {
            escape = false;
          } else if (char === "\\") {
            escape = true;
          } else if (char === quoteChar) {
            inString = false;
          }
          continue;
        }
        if (char === '"' || char === "'" || char === "`") {
          inString = true;
          quoteChar = char;
          continue;
        }
        if (char === "{") {
          depth += 1;
        } else if (char === "}") {
          depth -= 1;
          if (depth === 0) {
            const jsonText = source.slice(start, i + 1);
            try {
              parsedResult = JSON.parse(jsonText);
              parsedSuccessfully = true;
            } catch (_error) {
            }
            break;
          }
        }
      }
      if (parsedSuccessfully) {
        return parsedResult;
      }
    }
  }
  function parseYouTubeInitialPlayerResponse(logContentError, environment = globalThis) {
    const runtimeWindow = environment.window ?? globalThis.window;
    const runtimeDocument = environment.document ?? globalThis.document;
    let playerResponse = null;
    try {
      if (runtimeWindow?.ytInitialPlayerResponse) playerResponse = runtimeWindow.ytInitialPlayerResponse;
    } catch (error) {
      logContentError("Reading window.ytInitialPlayerResponse", error);
    }
    if (!playerResponse) {
      const scripts = Array.from(runtimeDocument?.scripts || []);
      for (const script of scripts) {
        if (script?.textContent?.includes("ytInitialPlayerResponse")) {
          const parsed = extractInitialPlayerResponse(script.textContent);
          if (parsed) {
            playerResponse = parsed;
            break;
          }
        }
      }
    }
    return playerResponse || {};
  }

  // content/youtube/metadata/details.js
  function parseIsoDurationSeconds(isoDuration) {
    if (!isoDuration) return null;
    const durationMatch = String(isoDuration).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (!durationMatch) return null;
    const hours = parseFloat(durationMatch[1] || 0);
    const minutes = parseFloat(durationMatch[2] || 0);
    const seconds = parseFloat(durationMatch[3] || 0);
    return hours * 3600 + minutes * 60 + seconds;
  }
  function cleanTitle(raw) {
    if (!raw) return null;
    const suffix = " - YouTube";
    const trimmed = String(raw).trim();
    return trimmed.endsWith(suffix) ? trimmed.slice(0, -suffix.length) : trimmed;
  }
  function collectPageVideoDetails({ inferIsLiveNow: inferIsLiveNow2, logContentError, environment = globalThis }) {
    const runtimeDocument = environment.document ?? globalThis.document;
    const runtimeLocation = environment.location ?? globalThis.location;
    const docTitle = cleanTitle(runtimeDocument?.title);
    const ogTitle = cleanTitle(runtimeDocument?.querySelector?.('meta[property="og:title"]')?.content);
    const itempropTitle = cleanTitle(runtimeDocument?.querySelector?.('meta[itemprop="name"]')?.content);
    const playerResponse = parseYouTubeInitialPlayerResponse(logContentError, environment);
    const title = docTitle || ogTitle || itempropTitle || cleanTitle(playerResponse?.videoDetails?.title) || null;
    let lengthSeconds = toPositiveFiniteNumber(
      parseIsoDurationSeconds(
        runtimeDocument?.querySelector?.('meta[itemprop="duration"]')?.getAttribute("content")
      )
    );
    if (lengthSeconds == null) {
      const responseLengthSeconds = playerResponse?.videoDetails?.lengthSeconds;
      if (responseLengthSeconds != null) {
        lengthSeconds = toPositiveFiniteNumber(responseLengthSeconds);
      }
    }
    const isLiveBroadcastMeta = runtimeDocument?.querySelector?.('meta[itemprop="isLiveBroadcast"]')?.getAttribute("content");
    const endDateMeta = runtimeDocument?.querySelector?.('meta[itemprop="endDate"]')?.getAttribute("content");
    const liveBroadcastDetails = playerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
    const isLive = inferIsLiveNow2({
      metaIsLiveBroadcast: isLiveBroadcastMeta,
      metaEndDate: endDateMeta,
      videoDetails: playerResponse?.videoDetails,
      playabilityStatus: playerResponse?.playabilityStatus,
      liveBroadcastDetails,
      lengthSeconds
    });
    return { title, lengthSeconds, isLive, url: runtimeLocation?.href };
  }

  // content/youtube/page/runtime-bridge.js
  function createExtensionRuntimeBridge({ config, environment, getChrome, getLocation }) {
    function logContentError(context, error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[TabSort] ${context}: ${message}`);
    }
    function hasExtensionRuntime() {
      return Boolean(getChrome()?.runtime?.id);
    }
    function sendExtensionMessage(payload, context) {
      if (!hasExtensionRuntime()) return false;
      try {
        getChrome().runtime.sendMessage(payload);
        return true;
      } catch (error) {
        if (context) logContentError(`Sending ${context}`, error);
        return false;
      }
    }
    function getCurrentPageUrl() {
      return getLocation()?.href || "";
    }
    function collectPageDetails() {
      return collectPageVideoDetails({
        environment,
        inferIsLiveNow: config.inferIsLiveNow,
        logContentError
      });
    }
    function publishPageVideoDetails() {
      try {
        const details = collectPageDetails();
        if (details.title || details.lengthSeconds != null || details.isLive) {
          sendExtensionMessage(
            createRuntimeMessage(RUNTIME_MESSAGE_TYPES.PAGE_VIDEO_DETAILS, { details }),
            "page video details"
          );
        }
      } catch (error) {
        logContentError("Sending page video details", error);
      }
    }
    return {
      collectPageDetails,
      getCurrentPageUrl,
      hasExtensionRuntime,
      logContentError,
      publishPageVideoDetails,
      sendExtensionMessage
    };
  }

  // shared/playback/constants.js
  var MEDIA_DURATION_SYNC_TOLERANCE_SECONDS = 2;

  // content/youtube/metadata/live-status.js
  function toBooleanFlag(value) {
    if (value === true) return true;
    if (value === false || value == null) return false;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return normalized === "true" || normalized === "1";
    }
    if (typeof value === "number") return value === 1;
    return false;
  }
  function hasNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }
  function inferIsLiveNow({
    metaIsLiveBroadcast,
    metaEndDate,
    videoDetails,
    playabilityStatus,
    liveBroadcastDetails,
    lengthSeconds
  } = {}) {
    if (toBooleanFlag(videoDetails?.isLive)) return true;
    if (toBooleanFlag(liveBroadcastDetails?.isLiveNow)) return true;
    const hasEndedSignal = hasNonEmptyString(metaEndDate) || hasNonEmptyString(liveBroadcastDetails?.endTimestamp);
    if (hasEndedSignal) return false;
    if (toBooleanFlag(metaIsLiveBroadcast)) return true;
    const hasLiveStreamabilitySignal = Boolean(playabilityStatus?.liveStreamability);
    const isLiveContent = toBooleanFlag(videoDetails?.isLiveContent);
    const numericLength = typeof lengthSeconds === "string" && lengthSeconds.trim() === "" ? NaN : Number(lengthSeconds);
    const hasFiniteLength = Number.isFinite(numericLength) && numericLength > 0;
    if ((hasLiveStreamabilitySignal || isLiveContent) && !hasFiniteLength) return true;
    return false;
  }

  // content/youtube/page/config.js
  var DEFAULT_MEDIA_READY_STATE_THRESHOLD = 2;
  var DEFAULT_PAGE_CONFIG = {
    mediaReadyStateThreshold: DEFAULT_MEDIA_READY_STATE_THRESHOLD,
    mediaDurationSyncToleranceSeconds: MEDIA_DURATION_SYNC_TOLERANCE_SECONDS
  };
  var DEFAULT_PAGE_DEPENDENCIES = {
    isFiniteNumber,
    inferIsLiveNow
  };

  // content/youtube/page/state.js
  function createVideoMetricsReadinessState() {
    return {
      videoMountObserver: null,
      metricsReadyPageUrl: null,
      lastMetricsReadyVideo: null,
      lastMetricsReadyFingerprint: null,
      videoMetricsReadyListenerVideo: null,
      videoMetricsReadyListenerCleanup: null,
      videoMountCheckScheduled: false,
      videoMountCheckToken: 0
    };
  }
  function createTitleObserverState() {
    return {
      titleElementObserver: null,
      titleTextObserver: null,
      observedTitleElement: null,
      lastKnownTitleText: null
    };
  }
  function createControllerLifecycleState() {
    return {
      initialized: false,
      observedPageUrl: null,
      lastScriptReadyUrl: null,
      cleanupFns: [],
      runtimeMessageListener: null
    };
  }
  function createPageControllerState() {
    return {
      lifecycle: createControllerLifecycleState(),
      videoMetricsReadiness: createVideoMetricsReadinessState(),
      titleObserver: createTitleObserverState()
    };
  }

  // content/youtube/page/ready-signal.js
  function shouldSendContentScriptReadySignal(currentUrl, lastScriptReadyUrl, { force = false } = {}) {
    return Boolean(currentUrl) && (force || currentUrl !== lastScriptReadyUrl);
  }

  // content/youtube/media/elements.js
  function getPrimaryVideoElement(environment = globalThis) {
    const runtimeDocument = environment.document ?? globalThis.document;
    const runtimeWindow = environment.window ?? globalThis.window;
    const VideoElement = environment.HTMLVideoElement ?? globalThis.HTMLVideoElement;
    const videos = Array.from(runtimeDocument?.querySelectorAll?.("video") || []);
    if (videos.length === 0) return null;
    if (videos.length === 1) return videos[0];
    const viewportWidth = runtimeWindow?.innerWidth || runtimeDocument?.documentElement?.clientWidth || 0;
    const viewportHeight = runtimeWindow?.innerHeight || runtimeDocument?.documentElement?.clientHeight || 0;
    let best = videos[0];
    let bestArea = -1;
    for (const video of videos) {
      if (typeof VideoElement === "function" && !(video instanceof VideoElement)) continue;
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
  }

  // content/youtube/media/readiness.js
  function createVideoMetricsReadinessTracker({
    config,
    environment,
    state,
    getCurrentPageUrl,
    getDocument,
    getMutationObserver,
    sendExtensionMessage,
    doesVideoDurationMatchPage
  }) {
    function isCurrentVideoMetricsReady() {
      const currentUrl = getCurrentPageUrl();
      return Boolean(currentUrl) && currentUrl === state.metricsReadyPageUrl;
    }
    function getVideoFingerprint(video) {
      if (!video || typeof video !== "object") return "";
      const source = typeof video.currentSrc === "string" && video.currentSrc || typeof video.src === "string" && video.src || "";
      const duration = config.isFiniteNumber(video.duration) ? String(Math.round(video.duration * 1e3)) : "";
      return `${source}|${duration}`;
    }
    function hasFreshMediaEvidence(video, observedFreshMediaEvent) {
      if (observedFreshMediaEvent) return true;
      if (!state.lastMetricsReadyVideo) return true;
      if (video !== state.lastMetricsReadyVideo) return true;
      const fingerprint = getVideoFingerprint(video);
      return Boolean(fingerprint) && fingerprint !== state.lastMetricsReadyFingerprint;
    }
    function canMarkVideoMetricsReady(video, observedFreshMediaEvent = false) {
      return video?.readyState >= config.mediaReadyStateThreshold && config.isFiniteNumber(video.duration) && hasFreshMediaEvidence(video, observedFreshMediaEvent) && doesVideoDurationMatchPage(video);
    }
    function clearVideoMetricsReadyListener() {
      if (typeof state.videoMetricsReadyListenerCleanup === "function") {
        state.videoMetricsReadyListenerCleanup();
      }
      state.videoMetricsReadyListenerVideo = null;
      state.videoMetricsReadyListenerCleanup = null;
    }
    function nodeMayContainVideo(node) {
      if (!node || node.nodeType !== 1) return false;
      if (String(node.tagName || "").toLowerCase() === "video") return true;
      return Boolean(node.querySelector?.("video"));
    }
    function mutationsMayContainVideo(mutations = []) {
      if (!Array.isArray(mutations) || mutations.length === 0) return true;
      return mutations.some((mutation) => {
        if (nodeMayContainVideo(mutation.target)) return true;
        return Array.from(mutation.addedNodes || []).some(nodeMayContainVideo);
      });
    }
    function markVideoMetricsReady(video, { notify = true } = {}) {
      const currentUrl = getCurrentPageUrl();
      if (!currentUrl) return false;
      state.metricsReadyPageUrl = currentUrl;
      state.lastMetricsReadyVideo = video;
      state.lastMetricsReadyFingerprint = getVideoFingerprint(video);
      if (notify) {
        sendExtensionMessage(
          createRuntimeMessage(RUNTIME_MESSAGE_TYPES.VIDEO_ELEMENT_READY),
          "video element ready"
        );
      }
      if (state.videoMetricsReadyListenerVideo === video) {
        clearVideoMetricsReadyListener();
      }
      return true;
    }
    function markCurrentVideoMetricsReadyIfAvailable({ notify = true } = {}) {
      if (isCurrentVideoMetricsReady()) return true;
      const video = getPrimaryVideoElement(environment);
      if (!canMarkVideoMetricsReady(video)) return false;
      return markVideoMetricsReady(video, { notify });
    }
    function requestVideoMountCheck() {
      if (state.videoMountCheckScheduled) return;
      state.videoMountCheckScheduled = true;
      state.videoMountCheckToken += 1;
      const scheduledToken = state.videoMountCheckToken;
      const runtimeWindow = environment.window ?? globalThis.window;
      const schedule = typeof runtimeWindow?.requestAnimationFrame === "function" ? runtimeWindow.requestAnimationFrame.bind(runtimeWindow) : (callback) => setTimeout(callback, 0);
      schedule(() => {
        if (scheduledToken !== state.videoMountCheckToken) return;
        state.videoMountCheckScheduled = false;
        attachVideoMetricsReadyListener();
        if (isCurrentVideoMetricsReady() && state.videoMountObserver) {
          state.videoMountObserver.disconnect();
          state.videoMountObserver = null;
        }
      });
    }
    function attachVideoMetricsReadyListener() {
      const video = getPrimaryVideoElement(environment);
      if (!video) return false;
      if (isCurrentVideoMetricsReady()) return true;
      if (canMarkVideoMetricsReady(video)) return markVideoMetricsReady(video);
      if (state.videoMetricsReadyListenerVideo === video) return true;
      clearVideoMetricsReadyListener();
      const events = ["loadedmetadata", "loadeddata", "durationchange", "canplay"];
      let observedFreshMediaEvent = false;
      const cleanup = () => {
        events.forEach((eventName) => video.removeEventListener(eventName, onAny));
        if (state.videoMetricsReadyListenerVideo === video) {
          state.videoMetricsReadyListenerVideo = null;
          state.videoMetricsReadyListenerCleanup = null;
        }
      };
      const maybeSend = () => {
        if (canMarkVideoMetricsReady(video, observedFreshMediaEvent)) {
          markVideoMetricsReady(video);
          return true;
        }
        return false;
      };
      const onAny = () => {
        observedFreshMediaEvent = true;
        maybeSend();
      };
      if (maybeSend()) return true;
      events.forEach((eventName) => video.addEventListener(eventName, onAny));
      state.videoMetricsReadyListenerVideo = video;
      state.videoMetricsReadyListenerCleanup = cleanup;
      return true;
    }
    function watchForVideoMount() {
      attachVideoMetricsReadyListener();
      if (isCurrentVideoMetricsReady()) {
        if (state.videoMountObserver) {
          state.videoMountObserver.disconnect();
          state.videoMountObserver = null;
        }
        return;
      }
      const MutationObserverCtor = getMutationObserver();
      const runtimeDocument = getDocument();
      if (!MutationObserverCtor || !runtimeDocument?.documentElement) return;
      if (!state.videoMountObserver) {
        state.videoMountObserver = new MutationObserverCtor((mutations) => {
          if (!mutationsMayContainVideo(mutations)) return;
          requestVideoMountCheck();
        });
        state.videoMountObserver.observe(runtimeDocument.documentElement, {
          childList: true,
          subtree: true
        });
        return;
      }
      attachVideoMetricsReadyListener();
      if (isCurrentVideoMetricsReady()) {
        state.videoMountObserver.disconnect();
        state.videoMountObserver = null;
      }
    }
    function disposeVideoMetricsReadinessObservers() {
      clearVideoMetricsReadyListener();
      state.videoMountCheckScheduled = false;
      state.videoMountCheckToken += 1;
      if (state.videoMountObserver) {
        state.videoMountObserver.disconnect();
        state.videoMountObserver = null;
      }
    }
    return {
      disposeVideoMetricsReadinessObservers,
      getVideoFingerprint,
      isCurrentVideoMetricsReady,
      markCurrentVideoMetricsReadyIfAvailable,
      watchForVideoMount
    };
  }

  // content/youtube/metadata/title-observer.js
  function createTitleObserver({
    state,
    getDocument,
    getMutationObserver,
    publishPageVideoDetails
  }) {
    function observeTitleElement(titleElement) {
      if (!titleElement || titleElement === state.observedTitleElement) return;
      const shouldSendUpdate = state.observedTitleElement !== null;
      state.observedTitleElement = titleElement;
      state.lastKnownTitleText = titleElement.textContent;
      if (state.titleTextObserver) state.titleTextObserver.disconnect();
      const MutationObserverCtor = getMutationObserver();
      if (!MutationObserverCtor) return;
      state.titleTextObserver = new MutationObserverCtor(() => {
        const nextTitle = titleElement.textContent;
        if (nextTitle === state.lastKnownTitleText) return;
        state.lastKnownTitleText = nextTitle;
        publishPageVideoDetails();
      });
      state.titleTextObserver.observe(titleElement, {
        childList: true,
        characterData: true,
        subtree: true
      });
      if (shouldSendUpdate) {
        publishPageVideoDetails();
      }
    }
    function watchTitleChanges() {
      const runtimeDocument = getDocument();
      observeTitleElement(runtimeDocument?.querySelector?.("title"));
      if (state.titleElementObserver) return;
      const target = runtimeDocument?.head || runtimeDocument?.documentElement;
      const MutationObserverCtor = getMutationObserver();
      if (!target || !MutationObserverCtor) return;
      state.titleElementObserver = new MutationObserverCtor(() => {
        observeTitleElement(runtimeDocument.querySelector("title"));
      });
      state.titleElementObserver.observe(target, { childList: true, subtree: true });
    }
    function disposeTitleObservers() {
      if (state.titleElementObserver) {
        state.titleElementObserver.disconnect();
        state.titleElementObserver = null;
      }
      if (state.titleTextObserver) {
        state.titleTextObserver.disconnect();
        state.titleTextObserver = null;
      }
      state.observedTitleElement = null;
      state.lastKnownTitleText = null;
    }
    return {
      disposeTitleObservers,
      watchTitleChanges
    };
  }

  // content/youtube/media/metrics.js
  function getYouTubePlayer(environment = globalThis) {
    const runtimeDocument = environment.document ?? globalThis.document;
    return runtimeDocument?.querySelector?.("#movie_player") || null;
  }
  function getVideoDurationSeconds(video, player) {
    return toPositiveFiniteNumber(video?.duration) ?? toPositiveFiniteNumber(player?.getDuration?.());
  }
  function getVideoCurrentTimeSeconds(video, player) {
    return toFiniteNumber(video?.currentTime) ?? toFiniteNumber(player?.getCurrentTime?.());
  }
  function collectVideoMetrics({
    config,
    environment,
    collectPageDetails,
    isCurrentVideoMetricsReady,
    markCurrentVideoMetricsReadyIfAvailable
  }) {
    const video = getPrimaryVideoElement(environment);
    const player = getYouTubePlayer(environment);
    const details = collectPageDetails();
    markCurrentVideoMetricsReadyIfAvailable?.({ notify: false });
    return {
      title: details.title || null,
      url: details.url,
      videoElementReady: isCurrentVideoMetricsReady(),
      lengthSeconds: config.isFiniteNumber(details.lengthSeconds) ? details.lengthSeconds : null,
      isLive: Boolean(details.isLive),
      duration: getVideoDurationSeconds(video, player),
      currentTime: getVideoCurrentTimeSeconds(video, player),
      playbackRate: video && config.isFiniteNumber(video.playbackRate) && video.playbackRate > 0 ? video.playbackRate : 1,
      paused: video ? video.paused : null
    };
  }
  function handleCollectVideoMetricsMessage(message, sendResponse, options) {
    if (!message || message.type !== RUNTIME_MESSAGE_TYPES.COLLECT_VIDEO_METRICS) return false;
    sendResponse(collectVideoMetrics(options));
    return true;
  }

  // content/youtube/page/controller.js
  var YOUTUBE_VIDEO_PAGE_REGEX = /^https?:\/\/([^/]+\.)?youtube\.com\/(?:watch\?|shorts\/)/i;
  function createYouTubePageController({
    config = {},
    environment = globalThis
  } = {}) {
    const pageConfig = {
      ...DEFAULT_PAGE_CONFIG,
      ...DEFAULT_PAGE_DEPENDENCIES,
      ...config
    };
    const state = createPageControllerState();
    const { lifecycle, videoMetricsReadiness: videoMetricsReadinessState, titleObserver: titleObserverState } = state;
    const getDocument = () => environment.document ?? globalThis.document;
    const getWindow = () => environment.window ?? globalThis.window;
    const getLocation = () => environment.location ?? globalThis.location;
    const getChrome = () => environment.chrome ?? globalThis.chrome;
    const getMutationObserver = () => environment.MutationObserver ?? globalThis.MutationObserver;
    const {
      collectPageDetails,
      getCurrentPageUrl,
      hasExtensionRuntime,
      logContentError,
      publishPageVideoDetails,
      sendExtensionMessage
    } = createExtensionRuntimeBridge({
      config: pageConfig,
      environment,
      getChrome,
      getLocation
    });
    function registerCleanup(cleanup) {
      if (typeof cleanup !== "function") return;
      lifecycle.cleanupFns.push(cleanup);
    }
    function addWindowEventListener(target, type, listener, options) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, listener, options);
      registerCleanup(() => {
        target.removeEventListener?.(type, listener, options);
      });
    }
    function addRuntimeMessageListener(listener) {
      const runtime = getChrome()?.runtime;
      const messageBus = runtime?.onMessage;
      if (!messageBus?.addListener) return;
      messageBus.addListener(listener);
      registerCleanup(() => {
        messageBus.removeListener?.(listener);
      });
    }
    function doesVideoDurationMatchPage(video) {
      if (!video || !pageConfig.isFiniteNumber(video.duration)) {
        return false;
      }
      const details = collectPageDetails();
      if (!pageConfig.isFiniteNumber(details.lengthSeconds)) {
        return true;
      }
      return Math.abs(video.duration - details.lengthSeconds) <= pageConfig.mediaDurationSyncToleranceSeconds;
    }
    function dispatchContentScriptReadySignal({ force = false } = {}) {
      const currentUrl = getCurrentPageUrl();
      if (!shouldSendContentScriptReadySignal(currentUrl, lifecycle.lastScriptReadyUrl, { force })) {
        return;
      }
      lifecycle.lastScriptReadyUrl = currentUrl;
      sendExtensionMessage(
        createRuntimeMessage(RUNTIME_MESSAGE_TYPES.CONTENT_SCRIPT_READY),
        "content script ready"
      );
    }
    const videoMetricsReadiness = createVideoMetricsReadinessTracker({
      config: pageConfig,
      environment,
      state: videoMetricsReadinessState,
      getCurrentPageUrl,
      getDocument,
      getMutationObserver,
      sendExtensionMessage,
      doesVideoDurationMatchPage
    });
    const titleObserver = createTitleObserver({
      state: titleObserverState,
      getDocument,
      getMutationObserver,
      publishPageVideoDetails
    });
    function disposeObservers() {
      videoMetricsReadiness.disposeVideoMetricsReadinessObservers();
      titleObserver.disposeTitleObservers();
    }
    function disposeListeners() {
      while (lifecycle.cleanupFns.length) {
        const cleanup = lifecycle.cleanupFns.pop();
        try {
          cleanup?.();
        } catch (error) {
          logContentError("Cleaning up content script listener", error);
        }
      }
      lifecycle.runtimeMessageListener = null;
    }
    function syncObservedPageUrl() {
      const currentUrl = getCurrentPageUrl();
      if (currentUrl && currentUrl !== lifecycle.observedPageUrl) {
        disposeObservers();
        lifecycle.observedPageUrl = currentUrl;
        lifecycle.lastScriptReadyUrl = null;
        videoMetricsReadinessState.metricsReadyPageUrl = null;
      } else if (!lifecycle.observedPageUrl && currentUrl) {
        lifecycle.observedPageUrl = currentUrl;
      }
    }
    function isVideoPageUrl(url) {
      return typeof url === "string" && YOUTUBE_VIDEO_PAGE_REGEX.test(url);
    }
    function refreshPageState({ sendReadySignal = false, forceReadySignal = false } = {}) {
      syncObservedPageUrl();
      if (sendReadySignal) {
        dispatchContentScriptReadySignal({ force: forceReadySignal });
      }
      if (!isVideoPageUrl(getCurrentPageUrl())) {
        disposeObservers();
        return;
      }
      publishPageVideoDetails();
      videoMetricsReadiness.watchForVideoMount();
      titleObserver.watchTitleChanges();
    }
    function reset() {
      disposeObservers();
      disposeListeners();
      lifecycle.observedPageUrl = null;
      lifecycle.lastScriptReadyUrl = null;
      videoMetricsReadinessState.metricsReadyPageUrl = null;
      videoMetricsReadinessState.lastMetricsReadyVideo = null;
      videoMetricsReadinessState.lastMetricsReadyFingerprint = null;
      lifecycle.initialized = false;
    }
    function bootstrap() {
      if (lifecycle.initialized) return;
      lifecycle.initialized = true;
      if (!hasExtensionRuntime()) return;
      const runtimeWindow = getWindow();
      const runtimeDocument = getDocument();
      lifecycle.runtimeMessageListener = (message, _sender, sendResponse) => handleCollectVideoMetricsMessage(message, sendResponse, {
        config: pageConfig,
        environment,
        collectPageDetails,
        isCurrentVideoMetricsReady: videoMetricsReadiness.isCurrentVideoMetricsReady,
        markCurrentVideoMetricsReadyIfAvailable: videoMetricsReadiness.markCurrentVideoMetricsReadyIfAvailable
      });
      addRuntimeMessageListener(lifecycle.runtimeMessageListener);
      if (runtimeDocument?.readyState === "complete" || runtimeDocument?.readyState === "interactive") {
        refreshPageState({ sendReadySignal: true });
      } else {
        addWindowEventListener(
          runtimeWindow,
          "DOMContentLoaded",
          () => refreshPageState({ sendReadySignal: true }),
          { once: true }
        );
      }
      addWindowEventListener(runtimeWindow, "yt-navigate-finish", () => {
        refreshPageState({ sendReadySignal: true });
      });
      addWindowEventListener(runtimeWindow, "pageshow", (event) => {
        if (event.persisted) {
          refreshPageState({ sendReadySignal: true, forceReadySignal: true });
        }
      });
      addWindowEventListener(runtimeWindow, "pagehide", () => {
        disposeObservers();
        lifecycle.lastScriptReadyUrl = null;
        videoMetricsReadinessState.metricsReadyPageUrl = null;
        videoMetricsReadinessState.lastMetricsReadyVideo = null;
        videoMetricsReadinessState.lastMetricsReadyFingerprint = null;
      });
    }
    return {
      bootstrap,
      refreshPageState,
      reset
    };
  }
  var defaultYouTubePageController = createYouTubePageController();
  function bootstrapYouTubePageController() {
    defaultYouTubePageController.bootstrap();
  }

  // content/youtube/page/entry.js
  bootstrapYouTubePageController();
})();
