import assert from 'node:assert/strict';
import test from 'node:test';

import { openTikTokPipForPreparation } from '../../background/integrations/tiktok-pip.js';

test('requests TikTok PiP from the installed companion extension', async () => {
  const calls = [];
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage(extensionId, message, callback) {
        calls.push({ extensionId, message });
        callback({ ok: true, status: 'opened' });
      },
    },
  };

  const result = await openTikTokPipForPreparation(7);

  assert.deepEqual(result, { ok: true, status: 'opened' });
  assert.deepEqual(calls, [{
    extensionId: 'cfjneijpfcflfdhikjdjihaddnbbkdnp',
    message: { type: 'OPEN_FOR_TABSORT_PREPARATION', windowId: 7 },
  }]);
});

test('reports an unavailable TikTok extension without rejecting preparation', async () => {
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage(_extensionId, _message, callback) {
        globalThis.chrome.runtime.lastError = new Error('Receiving end does not exist');
        callback();
        globalThis.chrome.runtime.lastError = null;
      },
    },
  };

  assert.deepEqual(await openTikTokPipForPreparation(7), {
    ok: false,
    error: 'extensionUnavailable',
  });
});
