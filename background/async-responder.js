import { toErrorMessage } from '../shared/utils.js';

/**
 * Creates a higher-order function that wraps async handlers to ensure a response is always sent.
 * This prevents callers from waiting indefinitely for a response.
 * @param {function} sendResponse - The Chrome extension sendResponse callback.
 * @returns {function(fn: () => Promise<unknown>, label: string): true} A function that wraps async handlers.
 */
export function createAsyncResponder(sendResponse) {
    return (fn, label) => {
        Promise.resolve()
            .then(() => fn())
            .then((res) => {
                // Always send a response, even for void handlers
                // Use { ok: true } as default for handlers that don't return a value
                sendResponse(res !== undefined ? res : { ok: true });
            })
            .catch((error) => {
                const messageText = toErrorMessage(error);
                console.error(`[TabSort] handler "${label}" failed: ${messageText}`);
                sendResponse({ ok: false, error: messageText });
            });
        return true;
    };
}
