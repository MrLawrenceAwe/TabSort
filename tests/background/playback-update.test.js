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
