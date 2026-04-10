import { toErrorMessage } from './errors.js';

function log(level, context, detail) {
  const suffix = detail == null ? '' : `: ${toErrorMessage(detail)}`;
  console[level](`[TabSort] ${context}${suffix}`);
}

export function logDebug(context, detail) {
  log('debug', context, detail);
}

export function logWarn(context, detail) {
  log('warn', context, detail);
}

export function logError(context, detail) {
  log('error', context, detail);
}

export function logListenerError(label, error) {
  logDebug(`${label} failed`, error);
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
