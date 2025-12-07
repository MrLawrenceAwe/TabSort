export const MESSAGE_TYPES = Object.freeze({
  ERROR: 'error',
  LOG: 'log',
});

export const TAB_STATES = Object.freeze({
  UNSUSPENDED: 'unsuspended',
  SUSPENDED: 'suspended',
  LOADING: 'loading',
});

export const DEFAULT_SORT_OPTIONS = Object.freeze({
  groupNonYoutubeTabsByDomain: false,
});

/** Time window (ms) to consider a tab as "recently unsuspended" */
export const RECENTLY_UNSUSPENDED_MS = 5000;
