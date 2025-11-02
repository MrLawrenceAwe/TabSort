export const YT_WATCH_REGEX = /^https?:\/\/(www\.)?youtube\.com\/watch\?/i;
export const YT_DOMAIN_REGEX = /(^|\.)youtube\.com$/i;

export const isWatch = (url) => typeof url === 'string' && YT_WATCH_REGEX.test(url);

export function domainKey(url) {
  if (typeof url !== 'string' || !url) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch (_) {
    return url;
  }
}

export function isYoutubeDomain(url) {
  const host = domainKey(url);
  if (!host) return false;
  return YT_DOMAIN_REGEX.test(host.toLowerCase());
}

export function safeGet(obj, path, fallback = undefined) {
  try {
    return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj) ?? fallback;
  } catch (_) {
    return fallback;
  }
}
