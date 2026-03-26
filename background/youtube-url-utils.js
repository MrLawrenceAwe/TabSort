export const YOUTUBE_WATCH_URL_REGEX = /^https?:\/\/([^/]+\.)?youtube\.com\/watch\?/i;
export const YOUTUBE_SHORTS_URL_REGEX = /^https?:\/\/([^/]+\.)?youtube\.com\/shorts\//i;
export const YOUTUBE_DOMAIN_REGEX = /(^|\.)youtube\.com$/i;

export const isWatchOrShortsPage = (url) =>
  typeof url === 'string' && (YOUTUBE_WATCH_URL_REGEX.test(url) || YOUTUBE_SHORTS_URL_REGEX.test(url));

export function getHostnameKey(url) {
  if (typeof url !== 'string' || !url) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch (_) {
    return url;
  }
}

export function isYoutubeDomain(url) {
  const host = getHostnameKey(url);
  if (!host) return false;
  return YOUTUBE_DOMAIN_REGEX.test(host.toLowerCase());
}
