import { parseYouTubeInitialPlayerResponse } from './youtube-player-response.js';

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

export function collectPageVideoDetails({ inferIsLiveNow, logContentError, environment = globalThis }) {
  const runtimeDocument = environment.document ?? globalThis.document;
  const runtimeLocation = environment.location ?? globalThis.location;
  const docTitle = cleanTitle(runtimeDocument?.title);
  const ogTitle = cleanTitle(runtimeDocument?.querySelector?.('meta[property="og:title"]')?.content);
  const itempropTitle = cleanTitle(runtimeDocument?.querySelector?.('meta[itemprop="name"]')?.content);
  const playerResponse = parseYouTubeInitialPlayerResponse(logContentError, environment);

  const title =
    docTitle || ogTitle || itempropTitle || cleanTitle(playerResponse?.videoDetails?.title) || null;

  let lengthSeconds = parseIsoDurationSeconds(
    runtimeDocument?.querySelector?.('meta[itemprop="duration"]')?.getAttribute('content'),
  );

  if (lengthSeconds == null) {
    const responseLengthSeconds = playerResponse?.videoDetails?.lengthSeconds;
    if (responseLengthSeconds != null) lengthSeconds = Number(responseLengthSeconds);
  }

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
