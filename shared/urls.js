export function getSiteKey(url) {
  if (typeof url !== 'string' || !url) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch (_) {
    return url;
  }
}

