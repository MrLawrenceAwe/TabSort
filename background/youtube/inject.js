import { executeScriptInTab } from '../tabs/chrome-tabs.js';

const YOUTUBE_RUNTIME_PATH = 'dist/content-runtime.js';

export async function tryInjectYouTubeRuntime(tabId) {
  if (typeof tabId !== 'number') return false;
  const result = await executeScriptInTab(tabId, [YOUTUBE_RUNTIME_PATH]);
  return result.ok === true;
}
