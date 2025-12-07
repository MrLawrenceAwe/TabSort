/**
 * Safely checks if a value is a finite number.
 * Unlike the global isFinite(), this doesn't coerce strings.
 * @param {*} value - The value to check.
 * @returns {boolean}
 */
export function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Checks if a value is a valid, finite window ID.
 * @param {*} windowId - The value to check.
 * @returns {boolean}
 */
export function isValidWindowId(windowId) {
    return typeof windowId === 'number' && Number.isFinite(windowId);
}

/**
 * Extracts a message string from an error value.
 * @param {*} error - The error to extract a message from.
 * @returns {string}
 */
export function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
