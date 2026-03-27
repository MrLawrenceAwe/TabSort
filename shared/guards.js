export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export const isValidWindowId = (windowId) =>
  isFiniteNumber(windowId) && windowId >= 0;
