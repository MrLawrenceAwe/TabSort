import { getYouTubeVideoId } from '../../shared/youtube/urls.js';

const AUTO_PREPARED_KEY_PREFIX = 'autoPreparedTab:';
const keyFor = tabId => `${AUTO_PREPARED_KEY_PREFIX}${tabId}`;

// Session storage survives service-worker suspension and is independent of
// whichever browser window the popup is currently tracking.
export async function saveAutoPreparedTab(record) {
  const identity = getYouTubeVideoId(record?.url);
  if (!identity || record.remainingSecondsStale ||
      !Number.isFinite(record.videoDetails?.remainingSeconds)) return false;
  await chrome.storage.session.set({
    [keyFor(record.id)]: {
      identity,
      videoDetails: { ...record.videoDetails },
    },
  });
  return true;
}

export async function removeAutoPreparedTab(tabId) {
  await chrome.storage?.session?.remove(keyFor(tabId));
}

export async function transferAutoPreparedTab(addedTabId, removedTabId) {
  const saved = await chrome.storage.session.get(keyFor(removedTabId));
  const record = saved[keyFor(removedTabId)];
  if (!record) return;
  await chrome.storage.session.set({ [keyFor(addedTabId)]: record });
  await removeAutoPreparedTab(removedTabId);
}

export async function readAutoPreparedTabs() {
  return await chrome.storage?.session?.get(null) ?? {};
}

export function restoreAutoPreparedTab(tab, record, saved) {
  const autoPrepared = saved[keyFor(tab.id)];
  if (!tab.discarded || !autoPrepared ||
      autoPrepared.identity !== getYouTubeVideoId(tab.url) ||
      !Number.isFinite(autoPrepared.videoDetails?.remainingSeconds)) return record;
  return {
    ...record,
    videoDetails: { ...autoPrepared.videoDetails },
    remainingSecondsStale: false,
    autoPreparedRemainingTime: true,
  };
}
