import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initializePopupDom,
  resetPopupDom,
  setErrorMessage,
} from '../../popup/popup-dom.js';
import { popupUiState, resetPopupUiState } from '../../popup/popup-ui-state.js';

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
    ['emptyState', createFakeElement()],
    ['videoTabsReadyStatus', createFakeElement()],
    ['sortButton', createFakeElement()],
    ['tabsSorted', createFakeElement()],
    ['infoTable', createFakeElement()],
  ]);

  return {
    elements,
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    querySelector(selector) {
      if (selector === '.action-required' || selector === '.tab-status') {
        return createFakeElement();
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

test('popup view model keeps sort summary flags available for view decisions', () => {
  resetPopupUiState();
  popupUiState.sortSummary.backgroundTabs.haveStaleRemainingTime = true;
  assert.equal(popupUiState.sortSummary.backgroundTabs.haveStaleRemainingTime, true);
});

test('popup view can reset cached DOM references before reinitializing with a new document', () => {
  const firstDocument = createFakeDocument();
  const secondDocument = createFakeDocument();

  resetPopupDom();
  resetPopupUiState();
  initializePopupDom(firstDocument);
  setErrorMessage('First error');
  assert.equal(firstDocument.elements.get('popupError').textContent, 'First error');

  resetPopupDom();
  initializePopupDom(secondDocument);
  setErrorMessage('Second error');

  assert.equal(firstDocument.elements.get('popupError').textContent, 'First error');
  assert.equal(secondDocument.elements.get('popupError').textContent, 'Second error');
});
