import { RUNTIME_MESSAGE_TYPES } from '../../shared/messages.js';
import { MESSAGE_FAILURE_REASONS, sendMessageToTab } from '../tabs/chrome-tabs.js';
import { tryInjectYouTubeRuntime } from '../youtube/inject.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Keep the request, reinjection, retries, and result handling within one deadline.
// Consumers that await more work must recheck isCurrent before applying a result.
export async function readPlaybackMetrics(
  tabId,
  { timeoutMs, signal, retryAttempts = 0, retryDelayMs = 0 },
  onResult = result => result,
) {
  let timer;
  let onAbort;
  let expired = false;
  const isCurrent = () => !expired && !signal?.aborted;
  const cancelled = { ok: false, reason: 'aborted' };
  const request = () => sendMessageToTab(tabId, {
    type: RUNTIME_MESSAGE_TYPES.COLLECT_VIDEO_METRICS,
  });

  if (signal?.aborted) return cancelled;
  try {
    const pending = (async () => {
      let result = await request();
      if (!isCurrent()) return cancelled;
      if (result.reason === MESSAGE_FAILURE_REASONS.NO_RECEIVER) {
        const injected = await tryInjectYouTubeRuntime(tabId);
        if (!isCurrent()) return cancelled;
        if (injected) {
          for (let attempt = 0; attempt < retryAttempts; attempt += 1) {
            await sleep(retryDelayMs);
            if (!isCurrent()) return cancelled;
            result = await request();
            if (!isCurrent()) return cancelled;
            if (result.reason !== MESSAGE_FAILURE_REASONS.NO_RECEIVER) break;
          }
        }
      }
      return onResult(result, isCurrent);
    })();
    const requests = [pending, new Promise(resolve => {
      timer = setTimeout(() => resolve({ ok: false, reason: 'timedOut' }), timeoutMs);
    })];
    if (signal) {
      requests.push(new Promise(resolve => {
        onAbort = () => resolve(cancelled);
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
      }));
    }
    return await Promise.race(requests);
  } finally {
    // Chrome calls cannot be cancelled; late completions must not start more
    // work or apply their results after the consumer has stopped waiting.
    expired = true;
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}
