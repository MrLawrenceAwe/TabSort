import { executeScriptInTab } from './chrome-api.js';

const YOUTUBE_BOOTSTRAP_PATH = 'content/youtube/youtube-page-bootstrap.js';

export async function tryInjectYoutubeBootstrap(tabId) {
  if (typeof tabId !== 'number') return false;
  const result = await executeScriptInTab(tabId, [YOUTUBE_BOOTSTRAP_PATH]);
  return result.ok === true;
}
