/**
 * Safely checks if a value is a finite number.
 * Unlike the global isFinite(), this doesn't coerce strings.
 * @param {*} value - The value to check.
 * @returns {boolean}
 * Content scripts load this utility at runtime and fall back to a local default when needed.
 */
export function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Checks if a value is a valid, finite window ID.
 * Valid window IDs are non-negative finite numbers.
 * @param {*} windowId - The value to check.
 * @returns {boolean}
 */
export const isValidWindowId = (windowId) =>
    isFiniteNumber(windowId) && windowId >= 0;

/**
 * Extracts a message string from an error value.
 * @param {*} error - The error to extract a message from.
 * @returns {string}
 */
export function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
