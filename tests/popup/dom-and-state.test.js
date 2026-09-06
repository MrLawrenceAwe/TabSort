import { syncPopupLayout } from '../../popup/layout-view.js';
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
    ['groupOtherTabsToggle', createFakeElement()],
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
  popupState.sortSummary.readyPrefixMatchesPlan = false;
  assert.equal(popupState.sortSummary.readyPrefixMatchesPlan, false);
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
  popupState.sortSummary = { readyCount: 2, sortableCount: 10, readyPrefixMatchesPlan: true };
  syncPopupLayout();
  assert.equal(document.elements.get('organiseStatus').textContent,
    '2 of 10 sortable tabs ready · Ready tabs in order.');
  resetPopupDom();
  resetPopupState();
});
