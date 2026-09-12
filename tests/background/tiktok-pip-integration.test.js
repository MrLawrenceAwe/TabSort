import assert from 'node:assert/strict';
import test from 'node:test';

import { openTikTokPipForAutoPreparation } from '../../background/integrations/tiktok-pip.js';

test('requests TikTok PiP from the installed companion extension', async () => {
  const calls = [];
  globalThis.chrome = {
    runtime: {
      async sendMessage(extensionId, message) {
        calls.push({ extensionId, message });
        return { ok: true, status: 'opened' };
      },
    },
  };

  const result = await openTikTokPipForAutoPreparation(7);

  assert.deepEqual(result, { ok: true, status: 'opened' });
  assert.deepEqual(calls, [{
    extensionId: 'cfjneijpfcflfdhikjdjihaddnbbkdnp',
    message: { type: 'OPEN_FOR_TABSORT_AUTO_PREPARATION', windowId: 7 },
  }]);
});

test('reports an unavailable TikTok extension without rejecting auto-preparation', async () => {
  globalThis.chrome = {
    runtime: {
      async sendMessage() {
        throw new Error('Receiving end does not exist');
      },
    },
  };

  assert.deepEqual(await openTikTokPipForAutoPreparation(7), {
    ok: false,
    error: 'extensionUnavailable',
  });
});
