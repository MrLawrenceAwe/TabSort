import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_STATES } from '../../shared/tab-states.js';
import {
  RECENTLY_UNSUSPENDED_MS,
  RECENT_WATCH_TRANSITION_MS,
  MEDIA_WAIT_GRACE_MS,
  LOADING_GRACE_MS,
  determineUserAction,
  USER_ACTIONS,
} from '../../shared/tab-user-actions.js';
import { formatRemainingStatus, renderTabRow } from '../../popup/tab-row-view.js';

function makeRecord(overrides = {}) {
  return {
    id: 1,
    status: TAB_STATES.UNSUSPENDED,
    isLiveNow: false,
    isActiveTab: false,
    isHidden: false,
    contentScriptReady: true,
    videoElementReady: true,
    remainingTimeNeedsRefresh: false,
    unsuspendedTimestamp: null,
    videoDetails: { remainingTime: null },
    ...overrides,
  };
}

test('stale rows without remaining time do not suggest viewing the tab', () => {
  const record = makeRecord({
    remainingTimeNeedsRefresh: true,
    contentScriptReady: false,
    unsuspendedTimestamp: Date.now() - (RECENTLY_UNSUSPENDED_MS + 1000),
  });

  assert.equal(determineUserAction(record), USER_ACTIONS.RELOAD_TAB);
  assert.equal(formatRemainingStatus(record), 'unavailable');
});

test('recently unsuspended rows avoid contradictory stale guidance', () => {
  const record = makeRecord({
    remainingTimeNeedsRefresh: true,
    contentScriptReady: false,
    unsuspendedTimestamp: Date.now(),
  });

  assert.equal(determineUserAction(record), USER_ACTIONS.NONE);
  assert.equal(formatRemainingStatus(record), 'unavailable');
});

test('recent watch URL transitions avoid reload guidance while runtime can catch up', () => {
  const activeRecord = makeRecord({
    isActiveTab: true,
    remainingTimeNeedsRefresh: true,
    contentScriptReady: false,
    videoElementReady: false,
    transitionStartedAt: Date.now(),
    videoDetails: null,
  });
  const inactiveRecord = makeRecord({
    isActiveTab: false,
    remainingTimeNeedsRefresh: true,
    contentScriptReady: false,
    videoElementReady: false,
    transitionStartedAt: Date.now(),
    videoDetails: null,
  });

  assert.equal(determineUserAction(activeRecord), USER_ACTIONS.NONE);
  assert.equal(determineUserAction(inactiveRecord), USER_ACTIONS.NONE);
  assert.equal(formatRemainingStatus(activeRecord), 'unavailable');
});

test('stalled watch URL transitions eventually ask for the useful action', () => {
  const activeRecord = makeRecord({
    isActiveTab: true,
    remainingTimeNeedsRefresh: true,
    contentScriptReady: false,
    videoElementReady: false,
    transitionStartedAt: Date.now() - (RECENT_WATCH_TRANSITION_MS + 1000),
    videoDetails: null,
  });
  const inactiveRecord = makeRecord({
    isActiveTab: false,
    remainingTimeNeedsRefresh: true,
    contentScriptReady: false,
    videoElementReady: false,
    transitionStartedAt: Date.now() - (RECENT_WATCH_TRANSITION_MS + 1000),
    videoDetails: null,
  });

  assert.equal(determineUserAction(activeRecord), USER_ACTIONS.RELOAD_TAB);
  assert.equal(determineUserAction(inactiveRecord), USER_ACTIONS.RELOAD_TAB);
});

test('stale rows with remaining time can still request a focused tab when appropriate', () => {
  const record = makeRecord({
    remainingTimeNeedsRefresh: true,
    videoDetails: { remainingTime: 320 },
    contentScriptReady: true,
    isActiveTab: false,
  });

  assert.equal(determineUserAction(record), USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME);
  assert.equal(formatRemainingStatus(record), 'View tab to refresh time');
});

test('loading rows switch from waiting to focus after the loading grace period', () => {
  const recentLoadingRecord = makeRecord({
    status: TAB_STATES.LOADING,
    contentScriptReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS - 1000),
  });

  const stalledLoadingRecord = makeRecord({
    status: TAB_STATES.LOADING,
    contentScriptReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS + 1000),
  });

  assert.equal(determineUserAction(recentLoadingRecord), USER_ACTIONS.WAIT_FOR_LOAD);
  assert.equal(determineUserAction(stalledLoadingRecord), USER_ACTIONS.FOCUS_TAB);
});

test('active loading rows switch from waiting to reload after the loading grace period', () => {
  const activeStalledLoadingRecord = makeRecord({
    status: TAB_STATES.LOADING,
    isActiveTab: true,
    contentScriptReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS + 1000),
  });

  assert.equal(determineUserAction(activeStalledLoadingRecord), USER_ACTIONS.RELOAD_TAB);
});

test('active watch rows wait through video data mismatches instead of asking for reload', () => {
  const activeAdRecord = makeRecord({
    isActiveTab: true,
    contentScriptReady: true,
    videoElementReady: false,
    remainingTimeNeedsRefresh: true,
    videoWaitStartedAt: Date.now() - (MEDIA_WAIT_GRACE_MS - 1000),
    videoDetails: { remainingTime: 45143, lengthSeconds: 45143 },
  });

  assert.equal(determineUserAction(activeAdRecord), USER_ACTIONS.WAIT_FOR_VIDEO_DATA);
  assert.equal(formatRemainingStatus(activeAdRecord), 'unavailable');
});

test('active watch rows eventually ask for reload when video data stays stuck', () => {
  const activeStalledMediaRecord = makeRecord({
    isActiveTab: true,
    contentScriptReady: true,
    videoElementReady: false,
    remainingTimeNeedsRefresh: true,
    videoWaitStartedAt: Date.now() - (MEDIA_WAIT_GRACE_MS + 1000),
    videoDetails: { remainingTime: 45143, lengthSeconds: 45143 },
  });

  assert.equal(determineUserAction(activeStalledMediaRecord), USER_ACTIONS.RELOAD_TAB);
});

test('background unsuspended rows ask the user to view before reloading for missing time', () => {
  const record = makeRecord({
    isActiveTab: false,
    contentScriptReady: true,
    videoDetails: { remainingTime: null },
  });

  assert.equal(determineUserAction(record), USER_ACTIONS.VIEW_TAB_TO_LOAD_TIME);
});

function createFakeDocument() {
  return {
    createElement(tagName) {
      return {
        tagName,
        href: '',
        classList: { add() {} },
        textContent: '',
        addEventListener() {},
      };
    },
    createTextNode(textContent) {
      return { textContent };
    },
  };
}

function createFakeRow() {
  const classNames = new Set();
  return {
    cells: [],
    classList: {
      add(...names) {
        names.forEach((name) => classNames.add(name));
      },
      contains(name) {
        return classNames.has(name);
      },
    },
    insertCell(index) {
      const cell = {
        children: [],
        textContent: '',
        appendChild(child) {
          this.children.push(child);
          return child;
        },
      };
      const insertAt = index == null ? this.cells.length : index;
      this.cells.splice(insertAt, 0, cell);
      return cell;
    },
  };
}

test('reload rows receive the reload-required styling hook', () => {
  const previousDocument = globalThis.document;
  globalThis.document = createFakeDocument();
  try {
    const row = createFakeRow();
    const record = makeRecord({
      contentScriptReady: false,
      unsuspendedTimestamp: Date.now() - (RECENTLY_UNSUSPENDED_MS + 1000),
    });

    renderTabRow(row, record, false, () => {});

    assert.equal(row.classList.contains('reload-required-row'), true);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('wait rows render passive text instead of clickable actions', () => {
  const previousDocument = globalThis.document;
  globalThis.document = createFakeDocument();
  try {
    const cases = [
      [
        'Wait for tab to load',
        makeRecord({
          status: TAB_STATES.LOADING,
          contentScriptReady: false,
          videoElementReady: false,
          loadingStartedAt: Date.now() - (LOADING_GRACE_MS - 1000),
        }),
      ],
      [
        'Wait for video data',
        makeRecord({
          isActiveTab: true,
          contentScriptReady: true,
          videoElementReady: false,
          remainingTimeNeedsRefresh: true,
          videoWaitStartedAt: Date.now() - (MEDIA_WAIT_GRACE_MS - 1000),
          videoDetails: { remainingTime: 45143, lengthSeconds: 45143 },
        }),
      ],
    ];

    for (const [label, record] of cases) {
      const row = createFakeRow();

      renderTabRow(row, record, false, () => {
        throw new Error('wait action should not post messages');
      });

      assert.equal(row.cells[1].textContent, label);
      assert.equal(row.cells[1].children.length, 0);
    }
  } finally {
    globalThis.document = previousDocument;
  }
});
