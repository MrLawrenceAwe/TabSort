export const YT_WATCH_REGEX = /^https?:\/\/([^/]+\.)?youtube\.com\/watch\?/i;
export const YT_SHORTS_REGEX = /^https?:\/\/([^/]+\.)?youtube\.com\/shorts\//i;
export const YT_DOMAIN_REGEX = /(^|\.)youtube\.com$/i;

export const isWatch = (url) =>
  typeof url === 'string' && (YT_WATCH_REGEX.test(url) || YT_SHORTS_REGEX.test(url));

export function hostnameKey(url) {
  if (typeof url !== 'string' || !url) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch (_) {
    return url;
  }
}

export function isYoutubeDomain(url) {
  const host = hostnameKey(url);
  if (!host) return false;
  return YT_DOMAIN_REGEX.test(host.toLowerCase());
}
