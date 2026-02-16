import { TAB_STATES, RECENTLY_UNSUSPENDED_MS } from '../shared/constants.js';
import { isFiniteNumber } from '../shared/utils.js';
import { popupState } from './state.js';
import { sendMessageWithWindow } from './runtime.js';

const USER_ACTIONS = {
  RELOAD_TAB: 'Reload tab',
  INTERACT_WITH_TAB: 'Interact with tab',
  WAIT_FOR_LOAD: 'Wait for tab to load',
  INTERACT_WITH_TAB_THEN_RELOAD: 'Interact with tab/Reload tab',
  VIEW_TAB_TO_REFRESH_TIME: 'View tab to refresh time',
  NO_ACTION: '',
};

const MESSAGE_ACTIONS = Object.freeze({
  ACTIVATE_TAB: 'activateTab',
  RELOAD_TAB: 'reloadTab',
});

const COLUMN_CONFIG = Object.freeze({
  sorted: [
    { key: 'videoDetails', getter: formatVideoDetails },
    { key: 'index', getter: formatIndex },
  ],
  unsorted: [
    { key: 'videoDetails', getter: formatVideoDetails },
    { key: 'index', getter: formatIndex },
    { key: 'status', getter: (record) => record.status },
  ],
});

export function insertRowCells(row, tabRecord, isSortedView) {
  row.insertCell(0).textContent = tabRecord.videoDetails?.title ?? tabRecord.url;

  const userAction = determineUserAction(tabRecord);
  if (!isSortedView) insertUserActionCell(row, tabRecord, userAction);

  insertInfoCells(row, tabRecord, isSortedView, userAction);

  const remaining = tabRecord?.videoDetails?.remainingTime;
  const hasRemainingTime = isFiniteNumber(remaining) && !tabRecord.remainingTimeMayBeStale;
  if (hasRemainingTime && !isSortedView) row.classList.add('ready-row');
}

function insertInfoCells(row, record, sortedView, userAction) {
  const columns = sortedView ? COLUMN_CONFIG.sorted : COLUMN_CONFIG.unsorted;

  columns.forEach((column) => {
    const cell = row.insertCell(row.cells.length);
    const value = column.getter(record, userAction);

    cell.textContent = popupState.tabsInCurrentWindowAreKnownToBeSorted
      ? value
      : getFallbackValue(value);
  });
}

function insertUserActionCell(row, record, action) {
  const cell = row.insertCell(1);
  if (!action) {
    cell.textContent = '—';
    return;
  }

  if (action === USER_ACTIONS.INTERACT_WITH_TAB_THEN_RELOAD) {
    const interact = createLink(USER_ACTIONS.INTERACT_WITH_TAB, MESSAGE_ACTIONS.ACTIVATE_TAB, record.id);
    const reload = createLink(USER_ACTIONS.RELOAD_TAB, MESSAGE_ACTIONS.RELOAD_TAB, record.id);
    cell.appendChild(interact);
    cell.appendChild(document.createTextNode('/'));
    cell.appendChild(reload);
    return;
  }

  const link = createLink(
    action,
    action === USER_ACTIONS.RELOAD_TAB ? MESSAGE_ACTIONS.RELOAD_TAB : MESSAGE_ACTIONS.ACTIVATE_TAB,
    record.id,
  );
  cell.appendChild(link);
}

function createLink(text, messageAction, tabId) {
  const a = document.createElement('a');
  a.href = '#';
  a.classList.add('user-action-link');
  a.textContent = text;
  a.addEventListener('click', (event) => {
    event.preventDefault();
    sendMessageWithWindow(messageAction, { tabId });
  });
  return a;
}

export function formatVideoDetails(record, userAction = determineUserAction(record)) {
  if (record.isLiveStream) return 'Live Stream';

  const remaining = record?.videoDetails?.remainingTime;
  const hasRemainingTime = isFiniteNumber(remaining);

  if (record.remainingTimeMayBeStale) {
    return userAction === USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME
      ? USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME
      : 'unavailable';
  }

  return hasRemainingTime ? formatRemaining(remaining) : 'unavailable';
}

function formatIndex(record) {
  const idx = record.index;
  return isFiniteNumber(idx) ? idx + 1 : '';
}

function getFallbackValue(value) {
  if (value) return value;
  return USER_ACTIONS.NO_ACTION;
}

function formatRemaining(seconds) {
  if (!isFiniteNumber(seconds)) return '—';
  const totalMinutes = Math.floor(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const s = Math.floor(seconds % 60);
  return h < 1 ? `${m}m ${s}s` : `${h}h ${m}m ${s}s`;
}

function determineActionForMissingRemainingTime(tabRecord, recentlyUnsuspended) {
  switch (tabRecord.status) {
    case TAB_STATES.UNSUSPENDED:
      if (recentlyUnsuspended) return USER_ACTIONS.NO_ACTION;
      if (tabRecord.isActiveTab || !tabRecord.contentScriptReady) return USER_ACTIONS.RELOAD_TAB;
      return USER_ACTIONS.INTERACT_WITH_TAB_THEN_RELOAD;
    case TAB_STATES.SUSPENDED:
      return USER_ACTIONS.INTERACT_WITH_TAB;
    case TAB_STATES.LOADING:
      return USER_ACTIONS.WAIT_FOR_LOAD;
    default:
      return USER_ACTIONS.NO_ACTION;
  }
}

export function determineUserAction(tabRecord) {
  if (tabRecord?.isLiveStream) {
    return USER_ACTIONS.NO_ACTION;
  }

  const videoDetails = tabRecord?.videoDetails;
  const hasRemainingTime = isFiniteNumber(videoDetails?.remainingTime);

  const recentlyUnsuspended =
    tabRecord.unsuspendedTimestamp && Date.now() - tabRecord.unsuspendedTimestamp < RECENTLY_UNSUSPENDED_MS;

  if (!hasRemainingTime) {
    return determineActionForMissingRemainingTime(tabRecord, recentlyUnsuspended);
  }

  if (tabRecord?.remainingTimeMayBeStale) {
    if (!tabRecord.contentScriptReady || tabRecord.isActiveTab) {
      return determineActionForMissingRemainingTime(tabRecord, recentlyUnsuspended);
    }
    return USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME;
  }

  return USER_ACTIONS.NO_ACTION;
}
