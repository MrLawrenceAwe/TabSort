import { getHostnameKey, isWatchOrShortsPage, isYoutubeDomain } from './youtube-url-utils.js';

export function buildYoutubeTabOrder(unpinnedTabs, orderedTrackedTabIds) {
  const youtubeTabs = unpinnedTabs
    .filter((tab) => tab && isYoutubeDomain(tab.url))
    .sort((a, b) => a.index - b.index);
  if (!youtubeTabs.length) return [];

  const youtubeTrackedTabs = youtubeTabs.filter((tab) => isWatchOrShortsPage(tab.url));
  const trackedTabIdsInWindow = new Set(youtubeTrackedTabs.map((tab) => tab.id));
  const orderedFromRecords = orderedTrackedTabIds.filter((id) => trackedTabIdsInWindow.has(id));
  const seenTrackedTabIds = new Set(orderedFromRecords);
  const remainingTrackedTabIds = youtubeTrackedTabs
    .map((tab) => tab.id)
    .filter((id) => !seenTrackedTabIds.has(id));
  remainingTrackedTabIds.forEach((id) => seenTrackedTabIds.add(id));

  const otherYoutube = youtubeTabs
    .filter((tab) => !seenTrackedTabIds.has(tab.id))
    .map((tab) => tab.id);

  return [...orderedFromRecords, ...remainingTrackedTabIds, ...otherYoutube];
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
