import assert from 'node:assert/strict';
import test from 'node:test';
import { initializePopup } from '../../popup/controller.js';
import { resetPopupDom } from '../../popup/elements.js';
import { resetPopupState } from '../../popup/store.js';

test('initial snapshot failure retries automatically and listeners exist during loading', async () => {
  const previous = { window: globalThis.window, document: globalThis.document, chrome: globalThis.chrome };
  const elements = new Map(['popupError', 'popupStateMessage'].map(id => [id, {
    textContent: '', classList: { toggle() {} },
  }]));
  const listeners = new Set();
  let requests = 0;
  let recovered;
  const recovery = new Promise(resolve => { recovered = resolve; });
  globalThis.window = new EventTarget();
  globalThis.document = {
    getElementById: id => elements.get(id), querySelector: () => null,
  };
  globalThis.chrome = {
    tabs: { query: async () => [{ id: 99, windowId: 1 }] },
    runtime: {
      onMessage: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) },
      sendMessage: async message => {
        if (message.type !== 'getTabSnapshot') return { ok: true };
        assert.equal(listeners.size, 1);
        if (++requests <= 2) return { ok: false, error: 'windowSyncSuperseded' };
        recovered();
        return { windowId: 1, trackedTabOrder: [], tabRecordsById: {} };
      },
    },
  };
  resetPopupDom();
  resetPopupState();
  let timer;
  try {
    await initializePopup();
    assert.equal(requests, 2);
    assert.equal(elements.get('popupStateMessage').textContent, 'Tab data is unavailable.');
    await Promise.race([recovery, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Initial failure was never retried')), 2000);
    })]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests, 3);
    assert.equal(elements.get('popupStateMessage').textContent, 'No YouTube video tabs in this window.');
    assert.equal(elements.get('popupError').textContent, '');
  } finally {
    clearTimeout(timer);
    window.dispatchEvent(new Event('unload'));
    assert.equal(listeners.size, 0);
    Object.assign(globalThis, previous);
    resetPopupDom();
    resetPopupState();
  }
});
