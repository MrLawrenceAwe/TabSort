import { backgroundState } from './state.js';

export function logListenerError(label, error) {
  const message = error?.message || String(error);
  console.debug(`[TabSort] ${label} failed: ${message}`);
}

export function withErrorLogging(label, fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (error) {
      logListenerError(label, error);
    }
  };
}

export function shouldHandleWindow(windowId) {
  return backgroundState.trackedWindowId == null || windowId === backgroundState.trackedWindowId;
}
