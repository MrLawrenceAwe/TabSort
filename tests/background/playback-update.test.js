import assert from 'node:assert/strict';
import test from 'node:test';
import { derivePlaybackUpdate } from '../../background/playback/derive-update.js';
import { applyPlaybackStateUpdate } from '../../background/playback/apply-update.js';
import { createPlaybackMetricsFixture, createTabRecordFixture } from '../helpers/background-test-helpers.js';

test('playback readings preserve independently observed content-script readiness', () => {
  for (const contentScriptReady of [false, true]) {
    const record = createTabRecordFixture(1, { contentScriptReady });
    const update = derivePlaybackUpdate({
      metricsPayload: createPlaybackMetricsFixture(), record,
      requestedUrl: record.url, currentTabUrl: record.url,
    });
    applyPlaybackStateUpdate(record, update, record.url);
    assert.equal(record.contentScriptReady, contentScriptReady);
    assert.equal(record.playbackMetricsReady, true);
    assert.equal(record.videoDetails.remainingSeconds, 100);
    assert.equal(record.remainingSecondsStale, false);
  }
});

test('normal collection rejects a media duration that disagrees with page metadata', () => {
  const record = createTabRecordFixture(1);
  const update = derivePlaybackUpdate({
    record, requestedUrl: record.url, currentTabUrl: record.url,
    metricsPayload: createPlaybackMetricsFixture({
      metadataDurationSeconds: 200, mediaDurationSeconds: 100,
    }),
  });
  assert.equal(update.resolvedDurationSeconds, 200);
  assert.equal(update.playbackMetricsReady, false);
  assert.equal(update.remainingSecondsStale, true);
});

test('preparation explicitly trusts verified media rather than recorded duration', () => {
  const record = createTabRecordFixture(1, { videoDetails: { durationSeconds: 200 } });
  const update = derivePlaybackUpdate({
    record, requestedUrl: record.url, currentTabUrl: record.url,
    durationAuthority: 'media',
    metricsPayload: {
      url: record.url, mediaDurationSeconds: 100, positionSeconds: 25,
      playbackRate: 2, playbackMetricsReady: true,
    },
  });
  assert.equal(update.resolvedDurationSeconds, 100);
  assert.equal(update.playbackMetricsReady, true);
  assert.equal(update.remainingSeconds, 37.5);
  assert.equal(update.remainingSecondsStale, false);
});
