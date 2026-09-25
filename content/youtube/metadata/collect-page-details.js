import { toPositiveFiniteNumber } from '../../../shared/guards.js';
import { getYouTubeVideoId } from '../../../shared/youtube/urls.js';
import { parseYouTubeInitialPlayerResponse } from './player-response.js';

function parseIsoDurationSeconds(isoDuration) {
  if (!isoDuration) return null;
  const durationMatch = String(isoDuration).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!durationMatch) return null;
  const hours = parseFloat(durationMatch[1] || 0);
  const minutes = parseFloat(durationMatch[2] || 0);
  const seconds = parseFloat(durationMatch[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function cleanTitle(raw) {
  if (!raw) return null;
  const suffix = ' - YouTube';
  const trimmed = String(raw).trim();
  return trimmed.endsWith(suffix) ? trimmed.slice(0, -suffix.length) : trimmed;
}

export function collectPageDetails({ inferIsLiveNow, logContentError, environment = globalThis }) {
  const runtimeDocument = environment.document ?? globalThis.document;
  const runtimeLocation = environment.location ?? globalThis.location;
  const docTitle = cleanTitle(runtimeDocument?.title);
  const ogTitle = cleanTitle(runtimeDocument?.querySelector?.('meta[property="og:title"]')?.content);
  const itempropTitle = cleanTitle(runtimeDocument?.querySelector?.('meta[itemprop="name"]')?.content);
  const initialPlayerResponse = parseYouTubeInitialPlayerResponse(logContentError, environment);
  // Initial response scripts can survive YouTube's single-page navigation.
  const currentVideoId = getYouTubeVideoId(runtimeLocation?.href);
  const playerResponse = currentVideoId &&
    initialPlayerResponse?.videoDetails?.videoId === currentVideoId
    ? initialPlayerResponse
    : {};

  const title =
    docTitle || ogTitle || itempropTitle || cleanTitle(playerResponse?.videoDetails?.title) || null;

  // The player response describes the delivered media. The SEO duration can
  // differ by several seconds even when both belong to the same video.
  const lengthSeconds = toPositiveFiniteNumber(playerResponse?.videoDetails?.lengthSeconds) ?? toPositiveFiniteNumber(
    parseIsoDurationSeconds(
      runtimeDocument?.querySelector?.('meta[itemprop="duration"]')?.getAttribute('content'),
    ),
  );

  const isLiveBroadcastMeta = runtimeDocument
    ?.querySelector?.('meta[itemprop="isLiveBroadcast"]')
    ?.getAttribute('content');
  const endDateMeta = runtimeDocument?.querySelector?.('meta[itemprop="endDate"]')?.getAttribute('content');
  const liveBroadcastDetails = playerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
  const isLive = inferIsLiveNow({
    metaIsLiveBroadcast: isLiveBroadcastMeta,
    metaEndDate: endDateMeta,
    videoDetails: playerResponse?.videoDetails,
    playabilityStatus: playerResponse?.playabilityStatus,
    liveBroadcastDetails,
    lengthSeconds,
  });

  return { title, lengthSeconds, isLive, url: runtimeLocation?.href };
}
