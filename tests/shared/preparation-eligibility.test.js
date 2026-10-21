import assert from 'node:assert/strict';
import test from 'node:test';
import { isPreparationCandidate } from '../../shared/tabs/preparation-eligibility.js';

const sleeping = { loadState: 'discarded', remainingSecondsStale: true };

test('preparation candidates exclude selected, pinned, live, preparing, and ready videos', () => {
  assert.equal(isPreparationCandidate(sleeping), true);
  for (const excluded of [
    null,
    { ...sleeping, isActive: true },
    { ...sleeping, pinned: true },
    { ...sleeping, isLive: true },
    { ...sleeping, autoPreparationInProgress: true },
    { ...sleeping, hasAutoPreparedTime: true, remainingSecondsStale: false,
      videoDetails: { remainingSeconds: 40 } },
    { loadState: 'loaded', remainingSecondsStale: false, videoDetails: { remainingSeconds: 20 } },
  ]) assert.equal(isPreparationCandidate(excluded), false);
});
