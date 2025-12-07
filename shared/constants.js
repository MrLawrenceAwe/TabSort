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

/** Interval in minutes for the refresh alarm */
export const REFRESH_INTERVAL_MINUTES = 0.5;

/** 
 * HTMLMediaElement.readyState threshold for considering video ready.
 * Value of 2 corresponds to HAVE_CURRENT_DATA.
 */
export const MEDIA_READY_STATE_THRESHOLD = 2;

/** URL pattern for matching YouTube watch pages */
export const YOUTUBE_WATCH_URL_PATTERN = /youtube\.com\/watch/;
