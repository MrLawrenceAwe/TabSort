import assert from 'node:assert/strict';
import test from 'node:test';

import { syncFocusedWindow } from '../../background/window-lifecycle.js';
import {
  canManageWindow,
  trackedWindowStateView,
} from '../../background/tracked-window-store.js';
import {
  ensureChromeApi,
  resetTrackedWindowState,
  stubChromeTabQuery,
} from '../helpers/background-test-helpers.js';

ensureChromeApi({ tabs: true });

test(
  'syncFocusedWindow claims focused windows even before they have YouTube tabs',
  { concurrency: false },
  async () => {
    resetTrackedWindowState(1);
    stubChromeTabQuery([]);

    await syncFocusedWindow(2);

    assert.equal(trackedWindowStateView.windowId, 2);
    assert.equal(canManageWindow(2), true);
    assert.equal(canManageWindow(1), false);
  },
);
