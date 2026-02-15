import test from 'node:test';
import assert from 'node:assert/strict';

import { inferIsLiveNow } from '../shared/live-detection.js';

test('does not mark non-live videos as live when liveBroadcastDetails exists without isLiveNow', () => {
  const isLive = inferIsLiveNow({
    videoDetails: { isLiveContent: false, isLive: false },
    playabilityStatus: {},
    liveBroadcastDetails: { startTimestamp: '2024-06-01T00:00:00Z', isLiveNow: false },
    lengthSeconds: 2925,
  });

  assert.equal(isLive, false);
});

test('does not mark archived livestream uploads as currently live', () => {
  const isLive = inferIsLiveNow({
    videoDetails: { isLiveContent: true, isLive: false },
    playabilityStatus: { liveStreamability: {} },
    liveBroadcastDetails: {
      startTimestamp: '2024-06-01T00:00:00Z',
      endTimestamp: '2024-06-01T01:00:00Z',
      isLiveNow: false,
    },
    metaIsLiveBroadcast: 'true',
    metaEndDate: '2024-06-01T01:00:00Z',
    lengthSeconds: 3600,
  });

  assert.equal(isLive, false);
});

test('marks videos as live when explicit live-now signals are present', () => {
  assert.equal(
    inferIsLiveNow({ videoDetails: { isLive: true }, lengthSeconds: null }),
    true,
  );

  assert.equal(
    inferIsLiveNow({
      liveBroadcastDetails: { isLiveNow: 'true' },
      lengthSeconds: null,
    }),
    true,
  );
});

test('treats live-broadcast metadata as live only when no ended signal exists', () => {
  assert.equal(
    inferIsLiveNow({
      metaIsLiveBroadcast: 'true',
      metaEndDate: '',
      lengthSeconds: null,
    }),
    true,
  );

  assert.equal(
    inferIsLiveNow({
      metaIsLiveBroadcast: 'true',
      metaEndDate: '2024-06-01T01:00:00Z',
      lengthSeconds: null,
    }),
    false,
  );
});

test('uses isLiveContent/liveStreamability only as a fallback when duration is unknown', () => {
  assert.equal(
    inferIsLiveNow({
      videoDetails: { isLiveContent: true },
      playabilityStatus: { liveStreamability: {} },
      lengthSeconds: null,
    }),
    true,
  );

  assert.equal(
    inferIsLiveNow({
      videoDetails: { isLiveContent: true },
      playabilityStatus: { liveStreamability: {} },
      lengthSeconds: 120,
    }),
    false,
  );
});
