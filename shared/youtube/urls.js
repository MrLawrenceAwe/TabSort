const YOUTUBE_DOMAIN_REGEX = /(^|\.)youtube\.com$/i;

export const isYouTubeVideoPage = (url) => getYouTubeVideoId(url) != null;

export function getYouTubeVideoId(url) {
  if (typeof url !== 'string' || !url) return null;

  try {
    const parsed = new URL(url);
    if (!YOUTUBE_DOMAIN_REGEX.test(parsed.hostname || '')) return null;

    if (/^\/watch$/i.test(parsed.pathname)) {
      const videoId = parsed.searchParams.get('v');
      return videoId || null;
    }

    const shortsMatch = parsed.pathname.match(/^\/shorts\/([^/?#]+)/i);
    if (shortsMatch?.[1]) {
      return shortsMatch[1];
    }
  } catch (_) {
    return null;
  }

  return null;
}

export function hasYouTubeVideoChanged(previousUrl, nextUrl) {
  const previousIdentity = getYouTubeVideoId(previousUrl);
  const nextIdentity = getYouTubeVideoId(nextUrl);

  if (previousIdentity && nextIdentity) {
    return previousIdentity !== nextIdentity;
  }

  return Boolean(previousUrl) && Boolean(nextUrl) && previousUrl !== nextUrl;
}

export function getSiteKey(url) {
  if (typeof url !== 'string' || !url) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch (_) {
    return url;
  }
}

export function isYouTubeSite(url) {
  const host = getSiteKey(url);
  if (!host) return false;
  return YOUTUBE_DOMAIN_REGEX.test(host.toLowerCase());
}
