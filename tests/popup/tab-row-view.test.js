import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_LOAD_STATES } from '../../shared/tabs/load-states.js';
import {
  RECENTLY_UNSUSPENDED_MS,
  RECENT_WATCH_TRANSITION_MS,
  MEDIA_WAIT_GRACE_MS,
  LOADING_GRACE_MS,
  determineTabGuidance,
  TAB_GUIDANCE,
} from '../../shared/tab-readiness/action-guidance.js';
import { formatRemainingStatus, renderTabRow } from '../../popup/tab-row-view.js';

function makeRecord(overrides = {}) {
  return {
    id: 1,
    loadState: TAB_LOAD_STATES.UNSUSPENDED,
    isLive: false,
    isActive: false,
    isHidden: false,
    pageRuntimeReady: true,
    videoElementReady: true,
    remainingTimeStale: false,
    unsuspendedTimestamp: null,
    videoDetails: { remainingTime: null },
    ...overrides,
  };
}

test('stale rows without remaining time do not suggest viewing the tab', () => {
  const record = makeRecord({
    remainingTimeStale: true,
    pageRuntimeReady: false,
    unsuspendedTimestamp: Date.now() - (RECENTLY_UNSUSPENDED_MS + 1000),
  });

  assert.equal(determineTabGuidance(record), TAB_GUIDANCE.RELOAD_TAB);
  assert.equal(formatRemainingStatus(record), 'unavailable');
});

test('recently unsuspended rows avoid contradictory stale guidance', () => {
  const record = makeRecord({
    remainingTimeStale: true,
    pageRuntimeReady: false,
    unsuspendedTimestamp: Date.now(),
  });

  assert.equal(determineTabGuidance(record), TAB_GUIDANCE.NONE);
  assert.equal(formatRemainingStatus(record), 'unavailable');
});

test('recent watch URL transitions avoid reload guidance while runtime can catch up', () => {
  const activeRecord = makeRecord({
    isActive: true,
    remainingTimeStale: true,
    pageRuntimeReady: false,
    videoElementReady: false,
    transitionStartedAt: Date.now(),
    videoDetails: null,
  });
  const inactiveRecord = makeRecord({
    isActive: false,
    remainingTimeStale: true,
    pageRuntimeReady: false,
    videoElementReady: false,
    transitionStartedAt: Date.now(),
    videoDetails: null,
  });

  assert.equal(determineTabGuidance(activeRecord), TAB_GUIDANCE.NONE);
  assert.equal(determineTabGuidance(inactiveRecord), TAB_GUIDANCE.NONE);
  assert.equal(formatRemainingStatus(activeRecord), 'unavailable');
});

test('stalled watch URL transitions eventually ask for the useful action', () => {
  const activeRecord = makeRecord({
    isActive: true,
    remainingTimeStale: true,
    pageRuntimeReady: false,
    videoElementReady: false,
    transitionStartedAt: Date.now() - (RECENT_WATCH_TRANSITION_MS + 1000),
    videoDetails: null,
  });
  const inactiveRecord = makeRecord({
    isActive: false,
    remainingTimeStale: true,
    pageRuntimeReady: false,
    videoElementReady: false,
    transitionStartedAt: Date.now() - (RECENT_WATCH_TRANSITION_MS + 1000),
    videoDetails: null,
  });

  assert.equal(determineTabGuidance(activeRecord), TAB_GUIDANCE.RELOAD_TAB);
  assert.equal(determineTabGuidance(inactiveRecord), TAB_GUIDANCE.RELOAD_TAB);
});

test('stale rows with remaining time can still request an open tab when appropriate', () => {
  const record = makeRecord({
    remainingTimeStale: true,
    videoDetails: { remainingTime: 320 },
    pageRuntimeReady: true,
    isActive: false,
  });

  assert.equal(determineTabGuidance(record), TAB_GUIDANCE.VIEW_TAB_TO_REFRESH_TIME);
  assert.equal(formatRemainingStatus(record), 'Open tab to update remaining time');
});

test('loading rows switch from waiting to open after the loading grace period', () => {
  const recentLoadingRecord = makeRecord({
    loadState: TAB_LOAD_STATES.LOADING,
    pageRuntimeReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS - 1000),
  });

  const stalledLoadingRecord = makeRecord({
    loadState: TAB_LOAD_STATES.LOADING,
    pageRuntimeReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS + 1000),
  });

  assert.equal(determineTabGuidance(recentLoadingRecord), TAB_GUIDANCE.WAIT_FOR_LOAD);
  assert.equal(determineTabGuidance(stalledLoadingRecord), TAB_GUIDANCE.OPEN_TAB);
});

test('active loading rows switch from waiting to reload after the loading grace period', () => {
  const activeStalledLoadingRecord = makeRecord({
    loadState: TAB_LOAD_STATES.LOADING,
    isActive: true,
    pageRuntimeReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS + 1000),
  });

  assert.equal(determineTabGuidance(activeStalledLoadingRecord), TAB_GUIDANCE.RELOAD_TAB);
});

test('active watch rows wait through video data mismatches instead of asking for reload', () => {
  const activeAdRecord = makeRecord({
    isActive: true,
    pageRuntimeReady: true,
    videoElementReady: false,
    remainingTimeStale: true,
    waitingForVideoSince: Date.now() - (MEDIA_WAIT_GRACE_MS - 1000),
    videoDetails: { remainingTime: 45143, lengthSeconds: 45143 },
  });

  assert.equal(determineTabGuidance(activeAdRecord), TAB_GUIDANCE.WAIT_FOR_VIDEO_DATA);
  assert.equal(formatRemainingStatus(activeAdRecord), 'unavailable');
});

test('active watch rows eventually ask for reload when video data stays stuck', () => {
  const activeStalledMediaRecord = makeRecord({
    isActive: true,
    pageRuntimeReady: true,
    videoElementReady: false,
    remainingTimeStale: true,
    waitingForVideoSince: Date.now() - (MEDIA_WAIT_GRACE_MS + 1000),
    videoDetails: { remainingTime: 45143, lengthSeconds: 45143 },
  });

  assert.equal(determineTabGuidance(activeStalledMediaRecord), TAB_GUIDANCE.RELOAD_TAB);
});

test('background unsuspended rows ask the user to view before reloading for missing time', () => {
  const record = makeRecord({
    isActive: false,
    pageRuntimeReady: true,
    videoDetails: { remainingTime: null },
  });

  assert.equal(determineTabGuidance(record), TAB_GUIDANCE.VIEW_TAB_TO_LOAD_TIME);
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
      pageRuntimeReady: false,
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
          loadState: TAB_LOAD_STATES.LOADING,
          pageRuntimeReady: false,
          videoElementReady: false,
          loadingStartedAt: Date.now() - (LOADING_GRACE_MS - 1000),
        }),
      ],
      [
        'Wait for video data',
        makeRecord({
          isActive: true,
          pageRuntimeReady: true,
          videoElementReady: false,
          remainingTimeStale: true,
          waitingForVideoSince: Date.now() - (MEDIA_WAIT_GRACE_MS - 1000),
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
