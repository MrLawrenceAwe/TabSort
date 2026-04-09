import { TAB_STATES, RECENTLY_UNSUSPENDED_MS, LOADING_GRACE_MS } from '../shared/constants.js';
import { isFiniteNumber } from '../shared/guards.js';

export const USER_ACTIONS = {
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
    { key: 'remainingStatus', getter: formatRemainingStatus },
    { key: 'index', getter: formatIndex },
  ],
  unsorted: [
    { key: 'remainingStatus', getter: formatRemainingStatus },
    { key: 'index', getter: formatIndex },
    { key: 'status', getter: (record) => record.status },
  ],
});

export function insertRowCells(row, tabRecord, isSortedView, postRuntimeMessage) {
  row.insertCell(0).textContent = tabRecord.videoDetails?.title ?? tabRecord.url;

  const userAction = determineUserAction(tabRecord);
  if (!isSortedView) insertUserActionCell(row, tabRecord, userAction, postRuntimeMessage);

  insertInfoCells(row, tabRecord, isSortedView, userAction);

  const remaining = tabRecord?.videoDetails?.remainingTime;
  const hasRemainingTime = isFiniteNumber(remaining) && !tabRecord.isRemainingTimeStale;
  if (hasRemainingTime && !isSortedView) row.classList.add('ready-row');
}

function insertInfoCells(row, record, sortedView, userAction) {
  const columns = sortedView ? COLUMN_CONFIG.sorted : COLUMN_CONFIG.unsorted;

  columns.forEach((column) => {
    const cell = row.insertCell(row.cells.length);
    const value = column.getter(record, userAction);

    cell.textContent = sortedView ? value : toDisplayText(value);
  });
}

function insertUserActionCell(row, record, action, postRuntimeMessage) {
  const cell = row.insertCell(1);
  if (!action) {
    cell.textContent = '—';
    return;
  }

  if (action === USER_ACTIONS.INTERACT_WITH_TAB_THEN_RELOAD) {
    const interact = createActionLink(
      USER_ACTIONS.INTERACT_WITH_TAB,
      MESSAGE_ACTIONS.ACTIVATE_TAB,
      record.id,
      postRuntimeMessage,
    );
    const reload = createActionLink(
      USER_ACTIONS.RELOAD_TAB,
      MESSAGE_ACTIONS.RELOAD_TAB,
      record.id,
      postRuntimeMessage,
    );
    cell.appendChild(interact);
    cell.appendChild(document.createTextNode('/'));
    cell.appendChild(reload);
    return;
  }

  const linkElement = createActionLink(
    action,
    action === USER_ACTIONS.RELOAD_TAB ? MESSAGE_ACTIONS.RELOAD_TAB : MESSAGE_ACTIONS.ACTIVATE_TAB,
    record.id,
    postRuntimeMessage,
  );
  cell.appendChild(linkElement);
}

function createActionLink(text, actionType, tabId, postRuntimeMessage) {
  const linkElement = document.createElement('a');
  linkElement.href = '#';
  linkElement.classList.add('user-action-link');
  linkElement.textContent = text;
  linkElement.addEventListener('click', (event) => {
    event.preventDefault();
    postRuntimeMessage(actionType, { tabId });
  });
  return linkElement;
}

export function formatRemainingStatus(record, userAction = determineUserAction(record)) {
  if (record.isLiveStream) return 'Live Stream';

  const remaining = record?.videoDetails?.remainingTime;
  const hasRemainingTime = isFiniteNumber(remaining);

  if (record.isRemainingTimeStale) {
    return userAction === USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME
      ? USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME
      : 'unavailable';
  }

  return hasRemainingTime ? formatRemaining(remaining) : 'unavailable';
}

function formatIndex(record) {
  const tabIndex = record.index;
  return isFiniteNumber(tabIndex) ? tabIndex + 1 : '';
}

function toDisplayText(value) {
  if (value) return value;
  return USER_ACTIONS.NO_ACTION;
}

function formatRemaining(seconds) {
  if (!isFiniteNumber(seconds)) return '—';
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const wholeSeconds = Math.floor(seconds % 60);
  return hours < 1
    ? `${minutes}m ${wholeSeconds}s`
    : `${hours}h ${minutes}m ${wholeSeconds}s`;
}

function determineActionForMissingRemainingTime(tabRecord, recentlyUnsuspended) {
  switch (tabRecord.status) {
    case TAB_STATES.UNSUSPENDED:
      if (recentlyUnsuspended) return USER_ACTIONS.NO_ACTION;
      if (tabRecord.isActiveTab || !tabRecord.pageRuntimeReady) return USER_ACTIONS.RELOAD_TAB;
      return USER_ACTIONS.INTERACT_WITH_TAB_THEN_RELOAD;
    case TAB_STATES.SUSPENDED:
      return USER_ACTIONS.INTERACT_WITH_TAB;
    case TAB_STATES.LOADING:
      if (
        typeof tabRecord.loadingStartedAt === 'number' &&
        Date.now() - tabRecord.loadingStartedAt >= LOADING_GRACE_MS
      ) {
        return USER_ACTIONS.INTERACT_WITH_TAB;
      }
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

  if (tabRecord?.isRemainingTimeStale) {
    if (!tabRecord.pageRuntimeReady || tabRecord.isActiveTab) {
      return determineActionForMissingRemainingTime(tabRecord, recentlyUnsuspended);
    }
    return USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME;
  }

  return USER_ACTIONS.NO_ACTION;
}
