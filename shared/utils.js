export function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

export const isValidWindowId = (windowId) =>
    isFiniteNumber(windowId) && windowId >= 0;

export function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
