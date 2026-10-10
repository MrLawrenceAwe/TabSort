import { getSiteKey } from '../../shared/urls.js';
import { isYouTubeVideoPage, isYouTubeSite } from '../../shared/youtube/urls.js';

// A Chrome group must remain contiguous. Rank blocks by their first requested
// member and keep the requested order within each block.
export function keepTabGroupsTogether(tabIds, tabs) {
  const tabsById = new Map(tabs.map(tab => [tab.id, tab]));
  const blocks = new Map();
  for (const id of tabIds) {
    const groupId = tabsById.get(id)?.groupId;
    const key = groupId >= 0 ? `group:${groupId}` : `tab:${id}`;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(id);
  }
  return [...blocks.values()].flat();
}

export function buildYouTubeTabOrder(unpinnedTabs, orderedTrackedTabIds) {
  const youtubeTabs = unpinnedTabs
    .filter((tab) => tab && isYouTubeSite(tab.url))
    .sort((a, b) => a.index - b.index);
  if (!youtubeTabs.length) return [];

  const youtubeVideoTabs = youtubeTabs.filter((tab) => isYouTubeVideoPage(tab.url));
  const youtubeVideoTabIds = new Set(youtubeVideoTabs.map((tab) => tab.id));
  const orderedVideoTabIds = orderedTrackedTabIds.filter((id) => youtubeVideoTabIds.has(id));
  const seenYouTubeTabIds = new Set(orderedVideoTabIds);
  const remainingVideoTabIds = youtubeVideoTabs
    .map((tab) => tab.id)
    .filter((id) => !seenYouTubeTabIds.has(id));
  remainingVideoTabIds.forEach((id) => seenYouTubeTabIds.add(id));

  const otherYouTubeTabIds = youtubeTabs
    .filter((tab) => !seenYouTubeTabIds.has(tab.id))
    .map((tab) => tab.id);

  return [...orderedVideoTabIds, ...remainingVideoTabIds, ...otherYouTubeTabIds];
}

export function buildOtherTabOrder(unpinnedTabs, groupBySite) {
  const otherTabs = unpinnedTabs
    .filter((tab) => tab && !isYouTubeSite(tab.url))
    .sort((a, b) => a.index - b.index);
  if (!otherTabs.length) return [];

  if (!groupBySite) {
    return otherTabs.map((tab) => tab.id);
  }

  const domainToTabIds = new Map();

  for (const tab of otherTabs) {
    const key = getSiteKey(tab.url);
    if (!domainToTabIds.has(key)) {
      domainToTabIds.set(key, []);
    }
    domainToTabIds.get(key).push(tab.id);
  }

  return [...domainToTabIds.values()].flat();
}

export function buildTabOrder(unpinnedTabs, orderedTrackedTabIds, { groupOtherTabsBySite = false } = {}) {
  return keepTabGroupsTogether([
    ...buildYouTubeTabOrder(unpinnedTabs, orderedTrackedTabIds),
    ...buildOtherTabOrder(unpinnedTabs, groupOtherTabsBySite),
  ], unpinnedTabs);
}
