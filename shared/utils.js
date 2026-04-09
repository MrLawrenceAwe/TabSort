export function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isValidWindowId(windowId) {
  return isFiniteNumber(windowId) && windowId >= 0;
}
