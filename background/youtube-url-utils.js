export const YOUTUBE_WATCH_URL_REGEX = /^https?:\/\/([^/]+\.)?youtube\.com\/watch\?/i;
export const YOUTUBE_SHORTS_URL_REGEX = /^https?:\/\/([^/]+\.)?youtube\.com\/shorts\//i;
export const YOUTUBE_DOMAIN_REGEX = /(^|\.)youtube\.com$/i;

export const isWatchOrShortsPage = (url) =>
  typeof url === 'string' && (YOUTUBE_WATCH_URL_REGEX.test(url) || YOUTUBE_SHORTS_URL_REGEX.test(url));

export function getYoutubeVideoIdentity(url) {
  if (typeof url !== 'string' || !url) return null;

  try {
    const parsed = new URL(url);
    if (!YOUTUBE_DOMAIN_REGEX.test(parsed.hostname || '')) return null;

    if (/^\/watch$/i.test(parsed.pathname)) {
      const videoId = parsed.searchParams.get('v');
      return videoId ? `watch:${videoId}` : null;
    }

    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?#]+)/i);
    if (shortsMatch?.[1]) {
      return `shorts:${shortsMatch[1]}`;
    }
  } catch (_) {
    return null;
  }

  return null;
}

export function hasYoutubeVideoIdentityChanged(previousUrl, nextUrl) {
  const previousIdentity = getYoutubeVideoIdentity(previousUrl);
  const nextIdentity = getYoutubeVideoIdentity(nextUrl);

  if (previousIdentity && nextIdentity) {
    return previousIdentity !== nextIdentity;
  }

  return Boolean(previousUrl) && Boolean(nextUrl) && previousUrl !== nextUrl;
}

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
