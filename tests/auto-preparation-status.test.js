import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPreparationDetail } from '../shared/preparation-progress.js';

test('preparation reports the failed step reason instead of just a frozen count', () => {
  assert.equal(formatPreparationDetail({ status: 'stopped', reason: 'Could not return video' }), 'Could not return video');
  assert.equal(formatPreparationDetail({ status: 'running', phase: 'returning' }), 'Returning video to its original window');
  assert.equal(formatPreparationDetail({ status: 'complete', phase: 'returning' }), '');
});
