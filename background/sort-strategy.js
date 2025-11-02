import { domainKey, isWatch, isYoutubeDomain } from './helpers.js';

export function buildYoutubeTabOrder(unpinnedTabs, orderedWatchIds) {
  const youtubeTabs = unpinnedTabs
    .filter((tab) => tab && isYoutubeDomain(tab.url))
    .sort((a, b) => a.index - b.index);
  if (!youtubeTabs.length) return [];

  const youtubeWatchTabs = youtubeTabs.filter((tab) => isWatch(tab.url));
  const watchIdsInWindow = youtubeWatchTabs.map((tab) => tab.id);
  const orderedFromRecords = orderedWatchIds.filter((id) => watchIdsInWindow.includes(id));
  const seenWatch = new Set(orderedFromRecords);
  const residualWatch = youtubeWatchTabs
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
    const key = domainKey(tab.url);
    if (!domainToTabIds.has(key)) {
      domainToTabIds.set(key, []);
      domainOrder.push(key);
    }
    domainToTabIds.get(key).push(tab.id);
  }

  return domainOrder.flatMap((key) => domainToTabIds.get(key) || []);
}
