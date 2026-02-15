export function toBooleanFlag(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  if (typeof value === 'number') return value === 1;
  return false;
}

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Infers whether the current YouTube page is actively live right now.
 *
 * Notes:
 * - `isLiveContent` is true for many archived livestream uploads; by itself it is not enough.
 * - Presence of `liveBroadcastDetails` alone is also not enough, because ended broadcasts may still include it.
 */
export function inferIsLiveNow({
  metaIsLiveBroadcast,
  metaEndDate,
  videoDetails,
  playabilityStatus,
  liveBroadcastDetails,
  lengthSeconds,
} = {}) {
  if (toBooleanFlag(videoDetails?.isLive)) return true;
  if (toBooleanFlag(liveBroadcastDetails?.isLiveNow)) return true;

  const hasEndedSignal =
    hasNonEmptyString(metaEndDate) || hasNonEmptyString(liveBroadcastDetails?.endTimestamp);
  if (hasEndedSignal) return false;

  if (toBooleanFlag(metaIsLiveBroadcast)) return true;

  const hasLiveStreamability = Boolean(playabilityStatus?.liveStreamability);
  const isLiveContent = toBooleanFlag(videoDetails?.isLiveContent);
  const numericLength =
    typeof lengthSeconds === 'string' && lengthSeconds.trim() === ''
      ? NaN
      : Number(lengthSeconds);
  const hasFiniteLength = Number.isFinite(numericLength) && numericLength > 0;

  if ((hasLiveStreamability || isLiveContent) && !hasFiniteLength) return true;

  return false;
}
