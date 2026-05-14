export class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    FakeMutationObserver.instances.push(this);
  }

  observe(target, options) {
    this.target = target;
    this.options = options;
  }

  disconnect() {}
}

FakeMutationObserver.instances = [];

export function createEventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    dispatch(type, event = {}) {
      const listener = listeners.get(type);
      if (listener) listener(event);
    },
  };
}

export function createFakeVideo({
  readyState = 0,
  duration = NaN,
  currentSrc = '',
  src = '',
  paused = false,
  currentTime = 0,
} = {}) {
  const eventTarget = createEventTarget();
  return {
    ...eventTarget,
    readyState,
    duration,
    currentSrc,
    src,
    paused,
    currentTime,
  };
}

export function installRuntimeTestDom() {
  const windowTarget = createEventTarget();
  const titleElement = { textContent: 'Video One - YouTube' };
  const headElement = {};
  const documentElement = {};
  const player = {
    duration: NaN,
    currentTime: NaN,
    getDuration() {
      return this.duration;
    },
    getCurrentTime() {
      return this.currentTime;
    },
  };
  let durationContent = 'PT2M0S';
  const video = createFakeVideo({
    readyState: 3,
    duration: 120,
    currentSrc: 'blob:video-one',
  });
  let videos = [video];
  let querySelectorAllCount = 0;
  const animationFrameCallbacks = [];

  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.location = { href: 'https://www.youtube.com/watch?v=one' };
  globalThis.window = {
    ...windowTarget,
    innerWidth: 1280,
    innerHeight: 720,
    ytInitialPlayerResponse: null,
    requestAnimationFrame(callback) {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    },
  };
  globalThis.document = {
    readyState: 'complete',
    title: 'Video One - YouTube',
    head: headElement,
    documentElement,
    scripts: [],
    querySelector(selector) {
      if (selector === 'title') return titleElement;
      if (selector === 'meta[itemprop="duration"]') {
        return { getAttribute: () => durationContent };
      }
      if (selector === '#movie_player') return player;
      return null;
    },
    querySelectorAll() {
      querySelectorAllCount += 1;
      return videos;
    },
  };
  globalThis.chrome = {
    runtime: {
      id: 'tabsort-test',
      sendMessage(message) {
        installRuntimeTestDom.messages.push(message);
      },
      onMessage: {
        addListener(listener) {
          installRuntimeTestDom.runtimeMessageListeners.add(listener);
          installRuntimeTestDom.onMessageListener = listener;
        },
        removeListener(listener) {
          installRuntimeTestDom.runtimeMessageListeners.delete(listener);
          installRuntimeTestDom.onMessageListener =
            installRuntimeTestDom.runtimeMessageListeners.size > 0
              ? Array.from(installRuntimeTestDom.runtimeMessageListeners).at(-1)
              : null;
        },
      },
    },
  };

  return {
    getRuntimeMessageListenerCount() {
      return installRuntimeTestDom.runtimeMessageListeners.size;
    },
    windowTarget,
    updatePage({ href, title, duration }) {
      globalThis.location.href = href;
      globalThis.document.title = title;
      titleElement.textContent = title;
      durationContent = duration;
    },
    video,
    player,
    replaceVideos(nextVideos) {
      videos = nextVideos;
    },
    getQuerySelectorAllCount() {
      return querySelectorAllCount;
    },
    flushAnimationFrame() {
      const callback = animationFrameCallbacks.shift();
      if (callback) callback();
    },
    documentElement,
  };
}

installRuntimeTestDom.messages = [];
installRuntimeTestDom.onMessageListener = null;
installRuntimeTestDom.runtimeMessageListeners = new Set();

export function resetGlobals() {
  delete globalThis.MutationObserver;
  delete globalThis.location;
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.chrome;
  installRuntimeTestDom.messages = [];
  installRuntimeTestDom.onMessageListener = null;
  installRuntimeTestDom.runtimeMessageListeners = new Set();
  FakeMutationObserver.instances = [];
}
