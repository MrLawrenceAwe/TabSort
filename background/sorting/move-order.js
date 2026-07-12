import { getSiteKey, isYouTubeVideoPage, isYouTubeSite } from '../youtube/urls.js';

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

  const domainOrder = [];
  const domainToTabIds = new Map();

  for (const tab of otherTabs) {
    const key = getSiteKey(tab.url);
    if (!domainToTabIds.has(key)) {
      domainToTabIds.set(key, []);
      domainOrder.push(key);
    }
    domainToTabIds.get(key).push(tab.id);
  }

  return domainOrder.flatMap((key) => domainToTabIds.get(key) || []);
}
