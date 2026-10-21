import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatPreparationDetail,
  formatPreparationHeading,
  formatPreparationStatus,
} from '../../shared/preparation-progress.js';

test('preparation reports the failed step reason instead of just a frozen count', () => {
  assert.equal(formatPreparationDetail({ status: 'stopped', reason: 'Could not return video' }), 'Could not return video');
  assert.equal(formatPreparationDetail({ status: 'running', phase: 'returning' }), 'Returning video to its original window');
  assert.equal(formatPreparationDetail({ status: 'complete', phase: 'returning' }), '');
});

test('stopped preparation keeps its status heading and explains the reason separately', () => {
  const state = { status: 'stopped', reason: 'Could not return video',
    completed: 1, total: 2, ready: 1, skipped: 0 };
  assert.equal(formatPreparationHeading(state), 'Auto-prepare stopped');
  assert.equal(formatPreparationDetail(state), 'Could not return video');
  assert.equal(formatPreparationStatus(state),
    'Auto-prepare stopped: 1 of 2 checked · 1 ready · 0 skipped · Could not return video');
  assert.equal(formatPreparationHeading({ status: 'idle' }), 'No auto-prepare in progress');
  assert.equal(formatPreparationStatus({ status: 'idle' }), '');
});
