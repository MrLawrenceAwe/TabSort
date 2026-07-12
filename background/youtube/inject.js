import { executeScriptInTab } from '../tabs/chrome-tabs.js';

const YOUTUBE_BOOTSTRAP_PATH = 'content/youtube/page/bootstrap.js';

export async function tryInjectYouTubeBootstrap(tabId) {
  if (typeof tabId !== 'number') return false;
  const result = await executeScriptInTab(tabId, [YOUTUBE_BOOTSTRAP_PATH]);
  return result.ok === true;
}
