export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function toFiniteNumber(value) {
  if (value == null || value === '') return null;
  const numericValue = Number(value);
  return isFiniteNumber(numericValue) ? numericValue : null;
}

export function toPositiveFiniteNumber(value) {
  const numericValue = toFiniteNumber(value);
  return numericValue != null && numericValue > 0 ? numericValue : null;
}

export function isValidWindowId(windowId) {
  return isFiniteNumber(windowId) && windowId >= 0;
}
