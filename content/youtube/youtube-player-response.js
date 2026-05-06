function extractInitialPlayerResponse(source) {
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
            // Ignore parse errors from partial or invalid matches and continue.
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

export function parseYouTubeInitialPlayerResponse(logContentError, environment = globalThis) {
  const runtimeWindow = environment.window ?? globalThis.window;
  const runtimeDocument = environment.document ?? globalThis.document;
  let playerResponse = null;
  try {
    if (runtimeWindow?.ytInitialPlayerResponse) playerResponse = runtimeWindow.ytInitialPlayerResponse;
  } catch (error) {
    logContentError('Reading window.ytInitialPlayerResponse', error);
  }
  if (!playerResponse) {
    const scripts = Array.from(runtimeDocument?.scripts || []);
    for (const script of scripts) {
      if (script?.textContent?.includes('ytInitialPlayerResponse')) {
        const parsed = extractInitialPlayerResponse(script.textContent);
        if (parsed) {
          playerResponse = parsed;
          break;
        }
      }
    }
  }
  return playerResponse || {};
}
