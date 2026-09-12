import { getYouTubeVideoId } from '../../shared/youtube/urls.js';

const keyFor = tabId => `preparedTab:${tabId}`;

// Session storage survives service-worker suspension and is independent of
// whichever browser window the popup is currently tracking.
export async function savePreparedTab(record) {
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

export async function removePreparedTab(tabId) {
  await chrome.storage?.session?.remove(keyFor(tabId));
}

export async function readPreparedTabs() {
  return await chrome.storage?.session?.get(null) ?? {};
}

export function restorePreparedTab(tab, record, saved) {
  const prepared = saved[keyFor(tab.id)];
  if (!tab.discarded || !prepared ||
      prepared.identity !== getYouTubeVideoId(tab.url) ||
      !Number.isFinite(prepared.videoDetails?.remainingSeconds)) return record;
  return {
    ...record,
    videoDetails: { ...prepared.videoDetails },
    remainingSecondsStale: false,
    autoPreparedRemainingTime: true,
  };
}
