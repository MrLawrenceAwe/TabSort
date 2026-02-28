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

export const RECENTLY_UNSUSPENDED_MS = 5000;

export const REFRESH_INTERVAL_MINUTES = 1;

export const MEDIA_READY_STATE_THRESHOLD = 2;

export const YOUTUBE_WATCH_URL_PATTERN = /youtube\.com\/watch/;

export const REFRESH_ALARM_NAME = 'refreshRemaining';
