function isoToSeconds(iso) {
  if (!iso) return null;
  const durationMatch = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
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

function extractInitialPlayerResponse(source, logContentError) {
  if (typeof source !== 'string') return null;
  const identifier = 'ytInitialPlayerResponse';
  let searchIndex = 0;

  while (true) {
    const idIndex = source.indexOf(identifier, searchIndex);
    if (idIndex === -1) return null;
    searchIndex = idIndex + identifier.length;

    const equalsIndex = source.indexOf('=', idIndex);
    if (equalsIndex === -1) continue;

    const start = source.indexOf('{', equalsIndex);
    if (start === -1) continue;

    let depth = 0;
    let inString = false;
    let escape = false;
    let quoteChar = '';
    let parsedSuccessfully = false;
    let parsedResult = null;

    for (let i = start; i < source.length; i += 1) {
      const char = source[i];

      if (inString) {
        if (escape) {
          escape = false;
        } else if (char === '\\') {
          escape = true;
        } else if (char === quoteChar) {
          inString = false;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        quoteChar = char;
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const jsonText = source.slice(start, i + 1);
          try {
            parsedResult = JSON.parse(jsonText);
            parsedSuccessfully = true;
          } catch (error) {
            // Ignore parse errors from partial or invalid matches 
            // and continue to the next potential occurrence.
          }
          break;
        }
      }
    }

    if (parsedSuccessfully) {
      return parsedResult;
    }
  }
}

function parseYtInitialPlayerResponse(logContentError) {
  let playerResponse = null;
  try {
    if (window.ytInitialPlayerResponse) playerResponse = window.ytInitialPlayerResponse;
  } catch (error) {
    logContentError('Reading window.ytInitialPlayerResponse', error);
  }
  if (!playerResponse) {
    const scripts = Array.from(document.scripts || []);
    for (const script of scripts) {
      if (script?.textContent?.includes('ytInitialPlayerResponse')) {
        const parsed = extractInitialPlayerResponse(script.textContent, logContentError);
        if (parsed) {
          playerResponse = parsed;
          break;
        }
      }
    }
  }
  return playerResponse || {};
}

export function getPrimaryVideoElement() {
  const videos = Array.from(document.querySelectorAll('video'));
  if (videos.length === 0) return null;
  if (videos.length === 1) return videos[0];

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  let best = videos[0];
  let bestArea = -1;
  for (const video of videos) {
    if (!(video instanceof HTMLVideoElement)) continue;
    const rect = video.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    const area = width * height;

    if (area > bestArea) {
      bestArea = area;
      best = video;
      continue;
    }

    if (area === bestArea && best && best.paused && !video.paused) {
      best = video;
    }
  }

  return best;
}

export function collectPageVideoDetails({ inferIsLiveNow, logContentError }) {
  const docTitle = cleanTitle(document.title);
  const ogTitle = cleanTitle(document.querySelector('meta[property="og:title"]')?.content);
  const itempropTitle = cleanTitle(document.querySelector('meta[itemprop="name"]')?.content);
  const playerResponse = parseYtInitialPlayerResponse(logContentError);

  const title =
    docTitle || ogTitle || itempropTitle || cleanTitle(playerResponse?.videoDetails?.title) || null;

  let lengthSeconds = isoToSeconds(
    document.querySelector('meta[itemprop="duration"]')?.getAttribute('content'),
  );

  if (lengthSeconds == null) {
    const responseLengthSeconds = playerResponse?.videoDetails?.lengthSeconds;
    if (responseLengthSeconds != null) lengthSeconds = Number(responseLengthSeconds);
  }

  const isLiveBroadcastMeta = document
    .querySelector('meta[itemprop="isLiveBroadcast"]')
    ?.getAttribute('content');
  const endDateMeta = document.querySelector('meta[itemprop="endDate"]')?.getAttribute('content');
  const liveBroadcastDetails = playerResponse?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
  const isLive = inferIsLiveNow({
    metaIsLiveBroadcast: isLiveBroadcastMeta,
    metaEndDate: endDateMeta,
    videoDetails: playerResponse?.videoDetails,
    playabilityStatus: playerResponse?.playabilityStatus,
    liveBroadcastDetails,
    lengthSeconds,
  });

  return { title, lengthSeconds, isLive, url: location.href };
}
