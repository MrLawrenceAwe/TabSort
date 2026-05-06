export function getPrimaryVideoElement(environment = globalThis) {
  const runtimeDocument = environment.document ?? globalThis.document;
  const runtimeWindow = environment.window ?? globalThis.window;
  const VideoElement = environment.HTMLVideoElement ?? globalThis.HTMLVideoElement;
  const videos = Array.from(runtimeDocument?.querySelectorAll?.('video') || []);
  if (videos.length === 0) return null;
  if (videos.length === 1) return videos[0];

  const viewportWidth =
    runtimeWindow?.innerWidth || runtimeDocument?.documentElement?.clientWidth || 0;
  const viewportHeight =
    runtimeWindow?.innerHeight || runtimeDocument?.documentElement?.clientHeight || 0;

  let best = videos[0];
  let bestArea = -1;
  for (const video of videos) {
    if (typeof VideoElement === 'function' && !(video instanceof VideoElement)) continue;
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
