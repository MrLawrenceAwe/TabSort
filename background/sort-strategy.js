import { getHostnameKey, isWatchOrShortsPage, isYoutubeDomain } from './youtube-url-utils.js';

export function buildYoutubeTabOrder(unpinnedTabs, orderedTrackedVideoIds) {
  const youtubeTabs = unpinnedTabs
    .filter((tab) => tab && isYoutubeDomain(tab.url))
    .sort((a, b) => a.index - b.index);
  if (!youtubeTabs.length) return [];

  const youtubeTrackedVideoTabs = youtubeTabs.filter((tab) => isWatchOrShortsPage(tab.url));
  const trackedVideoIdsInWindow = new Set(youtubeTrackedVideoTabs.map((tab) => tab.id));
  const orderedFromRecords = orderedTrackedVideoIds.filter((id) => trackedVideoIdsInWindow.has(id));
  const seenWatch = new Set(orderedFromRecords);
  const residualWatch = youtubeTrackedVideoTabs
    .map((tab) => tab.id)
    .filter((id) => !seenWatch.has(id));
  residualWatch.forEach((id) => seenWatch.add(id));

  const otherYoutube = youtubeTabs
    .filter((tab) => !seenWatch.has(tab.id))
    .map((tab) => tab.id);

  return [...orderedFromRecords, ...residualWatch, ...otherYoutube];
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
