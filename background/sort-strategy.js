import { getHostnameKey, isWatchOrShortsPage, isYoutubeDomain } from './youtube-url-utils.js';

export function buildYoutubeTabOrder(unpinnedTabs, orderedTrackedTabIds) {
  const youtubeTabs = unpinnedTabs
    .filter((tab) => tab && isYoutubeDomain(tab.url))
    .sort((a, b) => a.index - b.index);
  if (!youtubeTabs.length) return [];

  const youtubeVideoTabs = youtubeTabs.filter((tab) => isWatchOrShortsPage(tab.url));
  const youtubeVideoTabIds = new Set(youtubeVideoTabs.map((tab) => tab.id));
  const orderedVideoTabIds = orderedTrackedTabIds.filter((id) => youtubeVideoTabIds.has(id));
  const seenYoutubeTabIds = new Set(orderedVideoTabIds);
  const remainingVideoTabIds = youtubeVideoTabs
    .map((tab) => tab.id)
    .filter((id) => !seenYoutubeTabIds.has(id));
  remainingVideoTabIds.forEach((id) => seenYoutubeTabIds.add(id));

  const otherYoutubeTabIds = youtubeTabs
    .filter((tab) => !seenYoutubeTabIds.has(tab.id))
    .map((tab) => tab.id);

  return [...orderedVideoTabIds, ...remainingVideoTabIds, ...otherYoutubeTabIds];
}

export function buildNonYoutubeOrder(unpinnedTabs, groupByDomain) {
  const nonYoutubeTabs = unpinnedTabs
    .filter((tab) => tab && !isYoutubeDomain(tab.url))
    .sort((a, b) => a.index - b.index);
  if (!nonYoutubeTabs.length) return [];

  if (!groupByDomain) {
    return nonYoutubeTabs.map((tab) => tab.id);
  }

  const domainOrder = [];
  const domainToTabIds = new Map();

  for (const tab of nonYoutubeTabs) {
    const key = getHostnameKey(tab.url);
    if (!domainToTabIds.has(key)) {
      domainToTabIds.set(key, []);
      domainOrder.push(key);
    }
    domainToTabIds.get(key).push(tab.id);
  }

  return domainOrder.flatMap((key) => domainToTabIds.get(key) || []);
}
