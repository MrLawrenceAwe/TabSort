import { toErrorMessage } from '../shared/utils.js';

export function createAsyncResponder(sendResponse) {
    return (fn, label) => {
        Promise.resolve()
            .then(() => fn())
            .then((res) => {
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
