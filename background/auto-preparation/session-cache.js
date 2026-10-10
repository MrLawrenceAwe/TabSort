import { applyAutoPreparedTime } from '../tabs/video-state.js';
import { getYouTubeVideoId } from '../../shared/youtube/urls.js';

const AUTO_PREPARED_KEY_PREFIX = 'autoPreparedTab:';
const getPreparedTabKey = tabId => `${AUTO_PREPARED_KEY_PREFIX}${tabId}`;

// Session storage survives service-worker suspension and is independent of
// whichever browser window the popup is currently tracking.
export async function saveAutoPreparedTab(record, { discarded = true } = {}) {
  const videoId = getYouTubeVideoId(record?.url);
  if (!videoId || record.remainingSecondsStale ||
      !Number.isFinite(record.videoDetails?.remainingSeconds)) return false;
  await chrome.storage.session.set({
    [getPreparedTabKey(record.id)]: {
      videoId,
      discarded,
      videoDetails: { ...record.videoDetails },
    },
  });
  return true;
}

export async function removeAutoPreparedTab(tabId) {
  await chrome.storage?.session?.remove(getPreparedTabKey(tabId));
}

export async function transferAutoPreparedTab(addedTabId, removedTabId) {
  const saved = await readAutoPreparedTabs();
  const record = saved[getPreparedTabKey(removedTabId)];
  if (!record) return;
  await chrome.storage.session.set({ [getPreparedTabKey(addedTabId)]: record });
  await removeAutoPreparedTab(removedTabId);
}

export async function readAutoPreparedTabs() {
  const stored = await chrome.storage?.session?.get(null) ?? {};
  const preparedTabs = {};
  const migratedTabs = {};
  for (const [key, cached] of Object.entries(stored)) {
    if (!key.startsWith(AUTO_PREPARED_KEY_PREFIX) || !cached) continue;
    // Rewrite the previous cache schema before restoring it. Keeping this
    // migration at the storage boundary preserves session readings without
    // carrying legacy field names into tab records or playback messages.
    const needsMigration = Object.hasOwn(cached, 'identity') ||
      (cached.videoDetails && Object.hasOwn(cached.videoDetails, 'lengthSeconds'));
    if (!needsMigration) {
      preparedTabs[key] = cached;
      continue;
    }
    const { identity, ...snapshot } = cached;
    snapshot.videoId ??= identity;
    if (snapshot.videoDetails) {
      const { lengthSeconds, ...details } = snapshot.videoDetails;
      if (!Object.hasOwn(details, 'durationSeconds') && lengthSeconds !== undefined) {
        details.durationSeconds = lengthSeconds;
      }
      snapshot.videoDetails = details;
    }
    preparedTabs[key] = snapshot;
    migratedTabs[key] = snapshot;
  }
  if (Object.keys(migratedTabs).length) await chrome.storage.session.set(migratedTabs);
  return preparedTabs;
}

export function restoreAutoPreparedTab(tab, record, saved) {
  const autoPrepared = saved[getPreparedTabKey(tab.id)];
  if (!autoPrepared || Boolean(tab.discarded) !== autoPrepared.discarded) return record;
  // Awake results are snapshots: never replace newer playback evidence or
  // restore them into a page that is still navigating.
  if (!tab.discarded && (tab.status !== 'complete' || record.videoDetails != null)) return record;
  const restored = { ...record };
  return applyAutoPreparedTime(restored, autoPrepared.videoId, autoPrepared.videoDetails, tab.url)
    ? restored : record;
}
