import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { controlSilentPlayback, createSilentPlaybackPreparation } from '../../background/auto-preparation/silent-playback.js';

function harness({ muted = false, reject = false } = {}) {
  const listeners = new Map();
  const events = [];
  let resolvePlay;
  const video = {
    muted, paused: true,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
    pause() { events.push(['pause', this.muted]); this.paused = true; },
    play() {
      events.push(['play', this.muted]);
      this.paused = false;
      return reject ? Promise.reject(new Error('Blocked')) : new Promise(resolve => { resolvePlay = resolve; });
    },
  };
  const windowListeners = new Map();
  globalThis.location = { href: 'https://www.youtube.com/watch?v=one' };
  globalThis.document = { querySelector: selector => selector.includes('.ytp-play-button') ? null : video };
  globalThis.window = {
    addEventListener: (name, callback) => windowListeners.set(name, callback),
    removeEventListener: name => windowListeners.delete(name),
  };
  globalThis.HTMLMediaElement = { prototype: { play() { return this.play(); } } };
  return { video, events, listeners, windowListeners, resolve: () => resolvePlay(),
    start: () => controlSilentPlayback('one', 'session', 'start'),
    stop: () => controlSilentPlayback('one', 'session', 'stop') };
}

afterEach(() => {
  globalThis.__tabSortSilentPreparation?.current?.finish(false);
  for (const key of ['__tabSortSilentPreparation', 'location', 'document', 'window', 'chrome', 'HTMLMediaElement']) delete globalThis[key];
});

for (const muted of [false, true]) {
  test(`initializes silently, pauses before restoring muted=${muted}, and never replays while polling`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const h = harness({ muted });
    assert.equal(h.start(), false);
    assert.deepEqual(h.events, [['play', true]]);
    assert.equal(h.start(), false);
    h.listeners.get('playing')();
    h.resolve();
    await Promise.resolve();
    assert.equal(h.video.muted, true);
    t.mock.timers.tick(250);
    assert.equal(h.video.paused, true);
    assert.equal(h.video.muted, muted);
    assert.deepEqual(h.events[1], ['pause', true]);
    assert.equal(h.start(), true);
    assert.equal(h.events.filter(([event]) => event === 'play').length, 1);
    assert.equal(h.windowListeners.size, 0);
  });
}

test('Stop cancels a pending play and a late completion cannot leave playback running', async () => {
  const h = harness();
  h.start();
  h.stop();
  assert.equal(h.video.paused, true);
  assert.equal(h.video.muted, false);
  h.video.paused = false;
  h.resolve();
  await Promise.resolve();
  assert.equal(h.video.paused, true);
  assert.equal(h.start(), false);
  assert.equal(h.events.filter(([event]) => event === 'play').length, 1);
});

test('Stop received before start prevents a delayed script from playing', () => {
  const h = harness();
  h.stop();
  assert.equal(h.start(), false);
  assert.deepEqual(h.events, []);
});

test('YouTube Play is invoked while muted so the player can restore saved progress', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  document.querySelector = selector => selector.includes('.ytp-play-button')
    ? { click() {
      assert.equal(h.video.muted, true);
      h.video.currentTime = 120;
      h.listeners.get('playing')();
    } } : h.video;
  assert.equal(h.start(), false);
  t.mock.timers.tick(250);
  assert.equal(h.start(), true);
  assert.equal(h.video.currentTime, 120);
  assert.equal(h.video.paused, true);
  assert.equal(h.video.muted, false);
  assert.equal(h.events.filter(([event]) => event === 'play').length, 0,
    'A synchronous playing event must not be followed by another unmuted play');
});

test('play rejection restores sound and does not claim readiness', async () => {
  const h = harness({ reject: true });
  h.start();
  await Promise.resolve();
  assert.equal(h.video.paused, true);
  assert.equal(h.video.muted, false);
  assert.equal(h.start(), false);
});

for (const event of ['pagehide', 'yt-navigate-start']) {
  test(`${event} pauses playback and restores mute before leaving the page`, () => {
    const h = harness();
    h.start();
    h.windowListeners.get(event)();
    assert.equal(h.video.paused, true);
    assert.equal(h.video.muted, false);
    assert.equal(h.start(), false);
  });
}

test('the watchdog stops a player that never starts, even without background cleanup', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  h.start();
  t.mock.timers.tick(10000);
  assert.equal(h.video.paused, true);
  assert.equal(h.video.muted, false);
  assert.equal(h.start(), false);
});

test('late media after the watchdog is accepted instead of waiting for a page reload', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = harness();
  h.start();
  t.mock.timers.tick(10000);
  assert.equal(h.start(), false);
  Object.assign(h.video, { readyState: 4, duration: 98 });
  assert.equal(h.start(), true);
  assert.equal(h.video.paused, true);
  assert.equal(h.video.muted, false);
});

test('failed initialization retries after a short backoff within the same document', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = harness({ reject: true });
  h.start();
  await Promise.resolve();
  assert.equal(h.start(), false);
  assert.equal(h.events.filter(([event]) => event === 'play').length, 1);
  t.mock.timers.tick(1000);
  h.start();
  await Promise.resolve();
  assert.equal(h.events.filter(([event]) => event === 'play').length, 2);
  assert.equal(h.video.muted, false);
});

test('uses YouTube player API in the main world and restores its mute state after pausing', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  const calls = [];
  const player = {
    isMuted: () => false,
    mute: () => { calls.push('mute'); h.video.muted = true; },
    playVideo: () => {
      calls.push('playVideo');
      assert.equal(h.video.muted, true);
      h.video.currentTime = 45;
      h.listeners.get('playing')();
    },
    pauseVideo: () => { calls.push('pauseVideo'); },
    unMute: () => { calls.push('unMute'); },
  };
  document.querySelector = selector => selector === '#movie_player' ? player : h.video;
  assert.equal(h.start(), false);
  assert.deepEqual(calls, ['mute', 'playVideo']);
  t.mock.timers.tick(250);
  assert.equal(h.start(), true);
  assert.deepEqual(calls, ['mute', 'playVideo', 'pauseVideo', 'unMute']);
  assert.equal(h.video.paused, true);
  assert.equal(h.video.muted, false);
  assert.equal(h.video.currentTime, 45);
  assert.equal(h.events.filter(([event]) => event === 'play').length, 0);
});

test('starts the media when the player API supplies metadata but leaves it paused', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  const player = { playVideo() { Object.assign(h.video, { duration: 1325, readyState: 1 }); } };
  document.querySelector = selector => selector === '#movie_player' ? player : h.video;
  h.start();
  assert.deepEqual(h.events, [['play', true]]);
  assert.equal(h.video.paused, false);
  h.listeners.get('playing')();
  t.mock.timers.tick(250);
  assert.equal(h.start(), true);
  assert.equal(h.video.paused, true);
});

test('a source replacement AbortError waits for new metadata and starts again', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  let plays = 0;
  h.video.play = () => {
    plays++;
    return plays === 1 ? Promise.reject({ name: 'AbortError' }) : new Promise(() => {});
  };
  h.start();
  await Promise.resolve();
  assert.equal(h.video.muted, true);
  assert.equal(h.video.paused, true);
  h.listeners.get('loadedmetadata')();
  assert.equal(plays, 2);
  h.listeners.get('playing')();
  t.mock.timers.tick(250);
  assert.equal(h.start(), true);
  assert.equal(h.video.muted, false);
});

test('autoplay extension overrides cannot block the explicitly requested muted preparation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  let nativeCalls = 0;
  h.video.play = () => { throw new Error('NotAllowedError'); };
  HTMLMediaElement.prototype.play = function () {
    nativeCalls++;
    assert.equal(this.muted, true);
    this.paused = false;
    return Promise.resolve();
  };
  assert.equal(h.start(), false);
  await Promise.resolve();
  t.mock.timers.tick(250);
  assert.equal(h.start(), true);
  assert.equal(nativeCalls, 1);
  assert.equal(h.video.paused, true);
  assert.equal(h.video.muted, false);
});

test('same-video navigation events do not permanently cancel a preparation token', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const h = harness();
  h.start();
  h.windowListeners.get('yt-navigate-start')();
  t.mock.timers.tick(1000);
  h.start();
  assert.equal(h.events.filter(([event]) => event === 'play').length, 2);
});

test('a timed-out injection gets a fresh session on the next playback preparation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  let release;
  globalThis.chrome = { scripting: { executeScript: async options => {
    calls.push(options);
    if (options.args[2] === 'start' && !release) {
      return new Promise(resolve => { release = resolve; });
    }
    return [{ result: true }];
  } } };
  const preparation = createSilentPlaybackPreparation();
  const signal = new AbortController().signal;
  const first = preparation.preparePlayback(1, 'one', signal);
  t.mock.timers.tick(2000);
  assert.equal(await first, false);
  assert.equal(await preparation.preparePlayback(1, 'one', signal), true);
  const [oldStart, , newStart] = calls;
  assert.notEqual(oldStart.args[1], newStart.args[1]);
  release([{ result: true }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.at(-1).args[1], oldStart.args[1]);
  await preparation.stop();
});

test('a different video cannot be initialized by a stale request', () => {
  const h = harness();
  location.href = 'https://www.youtube.com/watch?v=another';
  assert.equal(h.start(), false);
  assert.deepEqual(h.events, []);
});

test('reads the verified paused media directly without a content-script message', () => {
  const h = harness();
  document.title = 'Test video - YouTube';
  Object.assign(h.video, { readyState: 4, duration: 100, currentTime: 25, playbackRate: 2 });
  const metrics = controlSilentPlayback('one', 'session', 'metrics');
  assert.deepEqual(metrics, {
    url: location.href, title: 'Test video', playbackMetricsReady: true,
    mediaDurationSeconds: 100, positionSeconds: 25,
    playbackRate: 2, isLive: false,
  });
  assert.deepEqual(h.events, []);
});

test('direct metrics reject adverts, other video identities, seeking and unready media', () => {
  const h = harness();
  Object.assign(h.video, { readyState: 4, duration: 100, currentTime: 25 });
  let advert = true;
  let id = 'one';
  const player = { getVideoData: () => ({ video_id: id }), classList: { contains: () => advert } };
  document.querySelector = selector => selector === '#movie_player' ? player : h.video;
  assert.equal(controlSilentPlayback('one', 'session', 'metrics'), null);
  advert = false;
  id = 'other';
  assert.equal(controlSilentPlayback('one', 'session', 'metrics'), null);
  id = 'one';
  h.video.seeking = true;
  assert.equal(controlSilentPlayback('one', 'session', 'metrics'), null);
  h.video.seeking = false;
  h.video.readyState = 0;
  assert.equal(controlSilentPlayback('one', 'session', 'metrics'), null);
});

test('metadata and saved position can prepare a stalled buffer without waiting for playing', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  document.title = 'Video - YouTube';
  Object.assign(h.video, { readyState: 1, duration: 1713.301, currentTime: 1461 });
  h.start();
  assert.equal(h.video.muted, true);
  t.mock.timers.tick(250);
  assert.equal(h.video.paused, true);
  assert.equal(h.video.muted, false);
  assert.equal(h.start(), true);
  const metrics = controlSilentPlayback('one', 'session', 'metrics');
  assert.equal(metrics.positionSeconds, 1461);
  assert.equal(metrics.mediaDurationSeconds, 1713.301);
});

test('abort releases a stalled script call and cleans up a late start', async () => {
  const calls = [];
  let release;
  globalThis.chrome = { scripting: { executeScript: async options => {
    calls.push(options);
    return options.args[2] === 'start' ? new Promise(resolve => { release = resolve; }) : [];
  } } };
  const controller = new AbortController();
  const preparation = createSilentPlaybackPreparation();
  const pending = preparation.preparePlayback(1, 'one', controller.signal);
  controller.abort();
  assert.equal(await pending, false);
  await preparation.stop();
  release([{ result: true }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.map(call => call.args[2]), ['start', 'stop', 'stop']);
  assert.ok(calls.every(call => call.world === 'MAIN'));
});

test('a player that resumes after preparation is paused again instead of remaining unreadable', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  document.title = 'Video - YouTube';
  Object.assign(h.video, { readyState: 4, duration: 100, currentTime: 25 });
  h.start();
  t.mock.timers.tick(250);
  assert.equal(h.start(), true);
  h.video.paused = false;
  assert.equal(h.start(), false);
  assert.equal(h.video.muted, true);
  t.mock.timers.tick(250);
  assert.equal(h.start(), true);
  assert.equal(controlSilentPlayback('one', 'session', 'metrics').positionSeconds, 25);
});

test('an advert keeps playing muted until content replaces it instead of being paused forever', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  document.title = 'Video - YouTube';
  let advert = true;
  const player = { playVideo() {}, classList: { contains: () => advert } };
  document.querySelector = selector => selector === '#movie_player' ? player : h.video;
  Object.assign(h.video, { readyState: 4, duration: 30, currentTime: 0 });
  h.start();
  h.listeners.get('playing')();
  t.mock.timers.tick(250);
  assert.equal(h.video.paused, false);
  assert.equal(h.video.muted, true);
  assert.equal(h.start(), false);
  advert = false;
  Object.assign(h.video, { duration: 100, currentTime: 25 });
  // The same media element can switch to content without another playing event.
  assert.equal(h.start(), false);
  t.mock.timers.tick(250);
  assert.equal(h.start(), true);
  assert.equal(h.video.paused, true);
  assert.equal(h.video.muted, false);
  assert.equal(controlSilentPlayback('one', 'session', 'metrics').positionSeconds, 25);
});

test('an advert appearing during the pause delay stays muted and Stop still pauses it', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  let advert = false;
  const player = { playVideo() {}, classList: { contains: () => advert } };
  document.querySelector = selector => selector === '#movie_player' ? player : h.video;
  Object.assign(h.video, { readyState: 4, duration: 100, currentTime: 25 });
  h.start();
  advert = true;
  t.mock.timers.tick(250);
  assert.equal(h.video.paused, false);
  assert.equal(h.video.muted, true);
  assert.equal(h.start(), false);
  h.stop();
  assert.equal(h.video.paused, true);
  assert.equal(h.video.muted, false);
});

test('background polling completes preparation when hidden-page timers are throttled', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const h = harness();
  Object.assign(h.video, { readyState: 1, duration: 2355.841, currentTime: 624 });
  h.start();
  now += 500; // No page timer callbacks run while the window is hidden.
  assert.equal(h.start(), true);
  assert.equal(h.video.paused, true);
  assert.equal(h.video.muted, false);
});

test('background polling enforces the watchdog even when page timers never fire', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const h = harness();
  h.start();
  now += 10000;
  assert.equal(h.start(), false);
  assert.equal(h.video.paused, true);
  assert.equal(h.video.muted, false);
});

test('Shorts preparation uses the Shorts player rather than the empty watch-page player', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness();
  location.href = 'https://www.youtube.com/shorts/one';
  Object.assign(h.video, { readyState: 1, duration: 45, currentTime: 12 });
  const emptyVideo = { paused: true, readyState: 0 };
  const watchPlayer = { getVideoData: () => ({ video_id: 'old-watch-video' }) };
  const shortsPlayer = { playVideo() {}, getVideoData: () => ({ video_id: 'one', title: 'Short' }) };
  h.video.closest = selector => selector === '.html5-video-player' ? shortsPlayer : null;
  document.querySelector = selector => ({
    '#movie_player': watchPlayer,
    '#movie_player video': emptyVideo,
    '#shorts-player video': h.video,
    'video': emptyVideo,
  })[selector] ?? null;
  assert.equal(h.start(), false);
  t.mock.timers.tick(250);
  assert.equal(h.start(), true);
  assert.equal(controlSilentPlayback('one', 'session', 'metrics').positionSeconds, 12);
  assert.equal(h.video.paused, true);
});
