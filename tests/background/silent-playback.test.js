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
  return { video, events, listeners, windowListeners, resolve: () => resolvePlay(),
    start: () => controlSilentPlayback('one', 'session', 'start'),
    stop: () => controlSilentPlayback('one', 'session', 'stop') };
}

afterEach(() => {
  globalThis.__tabSortSilentPreparation?.current?.finish(false);
  for (const key of ['__tabSortSilentPreparation', 'location', 'document', 'window', 'chrome']) delete globalThis[key];
});

for (const muted of [false, true]) {
  test(`initializes silently, pauses before restoring muted=${muted}, and never replays while polling`, async () => {
    const h = harness({ muted });
    assert.equal(h.start(), false);
    assert.deepEqual(h.events, [['play', true]]);
    assert.equal(h.start(), false);
    h.listeners.get('playing')();
    h.resolve();
    await Promise.resolve();
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

test('YouTube Play is invoked while muted so the player can restore saved progress', () => {
  const h = harness();
  document.querySelector = selector => selector.includes('.ytp-play-button')
    ? { click() {
      assert.equal(h.video.muted, true);
      h.video.currentTime = 120;
      h.listeners.get('playing')();
    } } : h.video;
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

test('a different video cannot be initialized by a stale request', () => {
  const h = harness();
  location.href = 'https://www.youtube.com/watch?v=another';
  assert.equal(h.start(), false);
  assert.deepEqual(h.events, []);
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
  const pending = preparation.read(1, 'one', controller.signal);
  controller.abort();
  assert.equal(await pending, false);
  await preparation.stop();
  release([{ result: true }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.map(call => call.args[2]), ['start', 'stop', 'stop']);
});
