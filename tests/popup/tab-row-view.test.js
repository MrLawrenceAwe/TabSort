import { RECENTLY_LOADED_MS, RECENT_WATCH_TRANSITION_MS, MEDIA_WAIT_GRACE_MS, LOADING_GRACE_MS } from '../../shared/tabs/grace-periods.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import { TAB_LOAD_STATES } from '../../shared/tabs/load-states.js';
import {
  determineTabGuidance,
  TAB_GUIDANCE,
} from '../../shared/tabs/guidance.js';
import { formatRemainingStatus, renderTabRow } from '../../popup/tab-row-view.js';

function makeRecord(overrides = {}) {
  return {
    id: 1,
    loadState: TAB_LOAD_STATES.LOADED,
    isLive: false,
    isActive: false,
    isHidden: false,
    contentScriptReady: true,
    playbackMetricsReady: true,
    remainingSecondsStale: false,
    loadedAt: null,
    videoDetails: { remainingSeconds: null },
    ...overrides,
  };
}

test('stale rows without remaining time do not suggest viewing the tab', () => {
  const record = makeRecord({
    remainingSecondsStale: true,
    contentScriptReady: false,
    loadedAt: Date.now() - (RECENTLY_LOADED_MS + 1000),
  });

  assert.equal(determineTabGuidance(record), TAB_GUIDANCE.RELOAD_TAB);
  assert.equal(formatRemainingStatus(record), 'Couldn’t read time');
});

test('recently loaded rows avoid contradictory stale guidance', () => {
  const record = makeRecord({
    remainingSecondsStale: true,
    contentScriptReady: false,
    loadedAt: Date.now(),
  });

  assert.equal(determineTabGuidance(record), TAB_GUIDANCE.NONE);
  assert.equal(formatRemainingStatus(record), 'Loading video');
});

test('recent watch URL transitions avoid reload guidance while runtime can catch up', () => {
  const activeRecord = makeRecord({
    isActive: true,
    remainingSecondsStale: true,
    contentScriptReady: false,
    playbackMetricsReady: false,
    transitionStartedAt: Date.now(),
    videoDetails: null,
  });
  const inactiveRecord = makeRecord({
    isActive: false,
    remainingSecondsStale: true,
    contentScriptReady: false,
    playbackMetricsReady: false,
    transitionStartedAt: Date.now(),
    videoDetails: null,
  });

  assert.equal(determineTabGuidance(activeRecord), TAB_GUIDANCE.NONE);
  assert.equal(determineTabGuidance(inactiveRecord), TAB_GUIDANCE.NONE);
  assert.equal(formatRemainingStatus(activeRecord), 'Loading video');
});

test('stalled watch URL transitions eventually ask for the useful action', () => {
  const activeRecord = makeRecord({
    isActive: true,
    remainingSecondsStale: true,
    contentScriptReady: false,
    playbackMetricsReady: false,
    transitionStartedAt: Date.now() - (RECENT_WATCH_TRANSITION_MS + 1000),
    videoDetails: null,
  });
  const inactiveRecord = makeRecord({
    isActive: false,
    remainingSecondsStale: true,
    contentScriptReady: false,
    playbackMetricsReady: false,
    transitionStartedAt: Date.now() - (RECENT_WATCH_TRANSITION_MS + 1000),
    videoDetails: null,
  });

  assert.equal(determineTabGuidance(activeRecord), TAB_GUIDANCE.RELOAD_TAB);
  assert.equal(determineTabGuidance(inactiveRecord), TAB_GUIDANCE.RELOAD_TAB);
});

test('stale rows with remaining time can still request viewing the tab when appropriate', () => {
  const record = makeRecord({
    remainingSecondsStale: true,
    videoDetails: { remainingSeconds: 320 },
    contentScriptReady: true,
    isActive: false,
  });

  assert.equal(determineTabGuidance(record), TAB_GUIDANCE.VIEW_TAB_TO_REFRESH_TIME);
  assert.equal(formatRemainingStatus(record), 'Needs viewing');
});

test('loading rows switch from waiting to view after the loading grace period', () => {
  const recentLoadingRecord = makeRecord({
    loadState: TAB_LOAD_STATES.LOADING,
    contentScriptReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS - 1000),
  });

  const stalledLoadingRecord = makeRecord({
    loadState: TAB_LOAD_STATES.LOADING,
    contentScriptReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS + 1000),
  });

  assert.equal(determineTabGuidance(recentLoadingRecord), TAB_GUIDANCE.WAIT_FOR_LOAD);
  assert.equal(determineTabGuidance(stalledLoadingRecord), TAB_GUIDANCE.ACTIVATE_TAB);
});

test('active loading rows switch from waiting to reload after the loading grace period', () => {
  const activeStalledLoadingRecord = makeRecord({
    loadState: TAB_LOAD_STATES.LOADING,
    isActive: true,
    contentScriptReady: false,
    loadingStartedAt: Date.now() - (LOADING_GRACE_MS + 1000),
  });

  assert.equal(determineTabGuidance(activeStalledLoadingRecord), TAB_GUIDANCE.RELOAD_TAB);
});

test('active watch rows wait through video data mismatches instead of asking for reload', () => {
  const activeAdRecord = makeRecord({
    isActive: true,
    contentScriptReady: true,
    playbackMetricsReady: false,
    remainingSecondsStale: true,
    metricsWaitStartedAt: Date.now() - (MEDIA_WAIT_GRACE_MS - 1000),
    videoDetails: { remainingSeconds: 45143, lengthSeconds: 45143 },
  });

  assert.equal(determineTabGuidance(activeAdRecord), TAB_GUIDANCE.WAIT_FOR_VIDEO_DATA);
  assert.equal(formatRemainingStatus(activeAdRecord), 'Loading video');
});

test('active watch rows eventually ask for reload when video data stays stuck', () => {
  const activeStalledMediaRecord = makeRecord({
    isActive: true,
    contentScriptReady: true,
    playbackMetricsReady: false,
    remainingSecondsStale: true,
    metricsWaitStartedAt: Date.now() - (MEDIA_WAIT_GRACE_MS + 1000),
    videoDetails: { remainingSeconds: 45143, lengthSeconds: 45143 },
  });

  assert.equal(determineTabGuidance(activeStalledMediaRecord), TAB_GUIDANCE.RELOAD_TAB);
});

test('background loaded rows ask the user to view before reloading for missing time', () => {
  const record = makeRecord({
    isActive: false,
    contentScriptReady: true,
    videoDetails: { remainingSeconds: null },
  });

  assert.equal(determineTabGuidance(record), TAB_GUIDANCE.VIEW_TAB_TO_LOAD_TIME);
});

function createFakeDocument() {
  return {
    createElement(tagName) {
      const listeners = new Map();
      return {
        tagName,
        type: '',
        disabled: false,
        classList: { add() {} },
        textContent: '',
        addEventListener(type, listener) {
          listeners.set(type, listener);
        },
        setAttribute() {},
        removeAttribute() {},
        click() {
          return listeners.get('click')?.();
        },
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

test('highlighting identifies sortable ready rows and clears when the order is applied', () => {
  const previousDocument = globalThis.document;
  globalThis.document = createFakeDocument();
  try {
    for (const [overrides, organised, expected] of [
      [{}, false, true],
      [{ pinned: true }, false, false],
      [{ isLive: true }, false, false],
      [{ remainingSecondsStale: true }, false, false],
      [{ loadState: TAB_LOAD_STATES.DISCARDED, hasAutoPreparedTime: true }, false, true],
      [{}, true, false],
    ]) {
      const row = createFakeRow();
      renderTabRow(row, makeRecord({
        loadState: TAB_LOAD_STATES.LOADED,
        remainingSecondsStale: false,
        videoDetails: { title: 'Video', remainingSeconds: 30 },
        ...overrides,
      }), organised, () => {});
      assert.equal(row.classList.contains('ready-row'), expected);
    }
  } finally {
    globalThis.document = previousDocument;
  }
});

test('reload rows receive the reload-required styling hook', () => {
  const previousDocument = globalThis.document;
  globalThis.document = createFakeDocument();
  try {
    const row = createFakeRow();
    const record = makeRecord({
      contentScriptReady: false,
      loadedAt: Date.now() - (RECENTLY_LOADED_MS + 1000),
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
          contentScriptReady: false,
          playbackMetricsReady: false,
          loadingStartedAt: Date.now() - (LOADING_GRACE_MS - 1000),
        }),
      ],
      [
        'Wait for video data',
        makeRecord({
          isActive: true,
          contentScriptReady: true,
          playbackMetricsReady: false,
          remainingSecondsStale: true,
          metricsWaitStartedAt: Date.now() - (MEDIA_WAIT_GRACE_MS - 1000),
          videoDetails: { remainingSeconds: 45143, lengthSeconds: 45143 },
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

test('action guidance renders a semantic button and awaits the action result', async () => {
  const previousDocument = globalThis.document;
  globalThis.document = createFakeDocument();
  try {
    const row = createFakeRow();
    let request = null;
    renderTabRow(
      row,
      makeRecord({
        contentScriptReady: false,
        loadedAt: Date.now() - (RECENTLY_LOADED_MS + 1000),
      }),
      false,
      async (type, data) => {
        request = { type, data };
        return false;
      },
    );

    const button = row.cells[1].children[0];
    assert.equal(button.tagName, 'button');
    assert.equal(button.type, 'button');
    await button.click();
    assert.deepEqual(request, {
      type: 'reloadTab',
      data: { tabId: 1 },
    });
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, 'Reload tab');
  } finally {
    globalThis.document = previousDocument;
  }
});


test('remaining status labels auto-prepared sleeping tabs', () => {
  assert.equal(formatRemainingStatus(makeRecord({
    loadState: 'discarded',
    hasAutoPreparedTime: true,
    videoDetails: { remainingSeconds: 100 },
  })), '1m 40s · Auto-prepared · sleeping');
  assert.equal(formatRemainingStatus(makeRecord({
    loadState: 'discarded',
    videoDetails: { remainingSeconds: 100 },
  })), 'Sleeping');
  assert.equal(formatRemainingStatus(makeRecord({ loadState: 'loading', videoDetails: { remainingSeconds: 100 } })), 'Loading tab');
});
