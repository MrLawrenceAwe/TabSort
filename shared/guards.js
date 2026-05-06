export const MEDIA_DURATION_SYNC_TOLERANCE_SECONDS = 2;

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isValidWindowId(windowId) {
  return isFiniteNumber(windowId) && windowId >= 0;
}
