import { renderPopupControls } from '../../popup/controls-view.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initializePopupDom,
  resetPopupDom,
  setErrorMessage,
} from '../../popup/elements.js';
import {
  isSnapshotForActiveWindow,
  popupState,
  resetPopupState,
  setActiveWindowId,
} from '../../popup/store.js';

function createFakeElement() {
  return {
    textContent: '',
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
  };
}

function createFakeDocument() {
  const elements = new Map([
    ['popupError', createFakeElement()],
    ['popupNotice', createFakeElement()],
    ['popupStateMessage', createFakeElement()],
    ['backlogSummary', createFakeElement()],
    ['organiseStatus', createFakeElement()],
    ['organiseButton', createFakeElement()],
    ['organisedBadge', createFakeElement()],
    ['organisedBadgeText', createFakeElement()],
    ['groupOtherTabsToggle', createFakeElement()],
    ['openTikTokPipToggle', createFakeElement()],
    ['tabsTable', createFakeElement()],
  ]);

  return {
    elements,
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    querySelector(selector) {
      if (selector === '.next-step') {
        return createFakeElement();
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

test('popup view model keeps flat sort summary fields available for view decisions', () => {
  resetPopupState();
  popupState.sortSummary.readyTabsLeadInOrder = false;
  assert.equal(popupState.sortSummary.readyTabsLeadInOrder, false);
});

test('popup accepts snapshot broadcasts only for its active window', () => {
  resetPopupState();
  setActiveWindowId(2);

  assert.equal(isSnapshotForActiveWindow({ windowId: 2 }), true);
  assert.equal(isSnapshotForActiveWindow({ windowId: 1 }), false);
  assert.equal(isSnapshotForActiveWindow({}), false);
});

test('popup view can reset cached DOM references before reinitializing with a new document', () => {
  const firstDocument = createFakeDocument();
  const secondDocument = createFakeDocument();

  resetPopupDom();
  resetPopupState();
  initializePopupDom(firstDocument);
  setErrorMessage('First error');
  assert.equal(firstDocument.elements.get('popupError').textContent, 'First error');

  resetPopupDom();
  initializePopupDom(secondDocument);
  setErrorMessage('Second error');

  assert.equal(firstDocument.elements.get('popupError').textContent, 'First error');
  assert.equal(secondDocument.elements.get('popupError').textContent, 'Second error');
});


test('ordered ready subset keeps the unfinished readiness count visible', () => {
  const document = createFakeDocument();
  resetPopupDom();
  resetPopupState();
  initializePopupDom(document);
  popupState.sortSummary = { readyCount: 2, sortableCount: 10, readyTabsLeadInOrder: true };
  renderPopupControls();
  assert.equal(document.elements.get('organiseStatus').textContent,
    '2 of 10 sortable tabs ready · Ready tabs in order.');
  resetPopupDom();
  resetPopupState();
});

test('organise control hides for an organised layout and returns when the order changes', () => {
  const document = createFakeDocument();
  const button = document.elements.get('organiseButton');
  const badge = document.elements.get('organisedBadge');
  const option = createFakeElement();
  document.elements.get('groupOtherTabsToggle').closest = () => option;
  const hidden = new Map();
  for (const element of [button, badge, option]) {
    element.classList.toggle = (_name, value) => hidden.set(element, value);
  }

  resetPopupDom();
  resetPopupState();
  initializePopupDom(document);
  popupState.sortSummary = { readyCount: 3, sortableCount: 3, readyTabsLeadInOrder: true };
  popupState.isYouTubeLayoutOrganised = true;
  renderPopupControls();
  assert.equal(hidden.get(button), true);
  assert.equal(hidden.get(option), true);
  assert.equal(hidden.get(badge), false);
  assert.equal(document.elements.get('organisedBadgeText').textContent, 'YouTube tabs organised');

  popupState.isYouTubeLayoutOrganised = false;
  popupState.sortSummary.readyTabsLeadInOrder = false;
  renderPopupControls();
  assert.equal(hidden.get(button), false);
  assert.equal(button.textContent, 'Organise tabs');
  assert.equal(hidden.get(option), false);
  assert.equal(hidden.get(badge), true);
  resetPopupDom();
  resetPopupState();
});

test('TikTok PiP option follows the auto-prepare control visibility', () => {
  const document = createFakeDocument();
  const option = { hidden: false, classList: { toggle(name, hidden) { if (name === 'hide') this.owner.hidden = hidden; } } };
  option.classList.owner = option;
  document.elements.get('openTikTokPipToggle').closest = () => option;

  resetPopupDom();
  resetPopupState();
  initializePopupDom(document);
  popupState.sortSummary = { readyCount: 1, sortableCount: 2, readyTabsLeadInOrder: false };
  renderPopupControls();
  assert.equal(option.hidden, false);

  popupState.sortSummary = { readyCount: 2, sortableCount: 2, readyTabsLeadInOrder: false };
  renderPopupControls();
  assert.equal(option.hidden, true);
  resetPopupDom();
  resetPopupState();
});

test('auto-prepare hides the organised badge even if the current subset is ordered', () => {
  const document = createFakeDocument();
  const badge = document.elements.get('organisedBadge');
  let hidden;
  badge.classList.toggle = (_name, value) => { hidden = value; };
  resetPopupDom();
  resetPopupState();
  initializePopupDom(document);
  popupState.isYouTubeLayoutOrganised = true;
  popupState.sortSummary = { readyCount: 2, sortableCount: 2, readyTabsLeadInOrder: true };
  popupState.autoPreparation = { status: 'running', total: 3, completed: 1 };
  renderPopupControls();
  assert.equal(hidden, true);
  assert.equal(document.elements.get('organisedBadgeText').textContent, '');
  popupState.autoPreparation.status = 'complete';
  renderPopupControls();
  assert.equal(hidden, false);
  resetPopupDom();
  resetPopupState();
});
