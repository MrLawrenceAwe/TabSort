import { isFiniteNumber } from '../shared/guards.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import { determineUserAction, getUserActionLabel, USER_ACTIONS } from './tab-action-policy.js';

const MESSAGE_ACTIONS = Object.freeze({
  ACTIVATE_TAB: RUNTIME_MESSAGE_TYPES.ACTIVATE_TAB,
  RELOAD_TAB: RUNTIME_MESSAGE_TYPES.RELOAD_TAB,
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

export function renderTabRow(row, tabRecord, isSortedView, postRuntimeMessage) {
  row.insertCell(0).textContent = tabRecord.videoDetails?.title ?? tabRecord.url;

  const requiredAction = determineUserAction(tabRecord);
  if (!isSortedView) insertUserActionCell(row, tabRecord, requiredAction, postRuntimeMessage);

  insertInfoCells(row, tabRecord, isSortedView, requiredAction);

  const remaining = tabRecord?.videoDetails?.remainingTime;
  const hasRemainingTime = isFiniteNumber(remaining) && !tabRecord.isRemainingTimeStale;
  if (hasRemainingTime && !isSortedView) row.classList.add('sort-ready-row');
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
  if (action === USER_ACTIONS.NONE) {
    cell.textContent = '—';
    return;
  }

  if (action === USER_ACTIONS.FOCUS_THEN_RELOAD) {
    const focus = createActionLink(
      getUserActionLabel(USER_ACTIONS.FOCUS_TAB),
      MESSAGE_ACTIONS.ACTIVATE_TAB,
      record.id,
      postRuntimeMessage,
    );
    const reload = createActionLink(
      getUserActionLabel(USER_ACTIONS.RELOAD_TAB),
      MESSAGE_ACTIONS.RELOAD_TAB,
      record.id,
      postRuntimeMessage,
    );
    cell.appendChild(focus);
    cell.appendChild(document.createTextNode('/'));
    cell.appendChild(reload);
    return;
  }

  const linkElement = createActionLink(
    getUserActionLabel(action),
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

export function formatRemainingStatus(record, requiredAction = determineUserAction(record)) {
  if (record.isLiveNow) return 'Live Stream';

  const remaining = record?.videoDetails?.remainingTime;
  const hasRemainingTime = isFiniteNumber(remaining);

  if (record.isRemainingTimeStale) {
    return requiredAction === USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME
      ? getUserActionLabel(USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME)
      : 'unavailable';
  }

  return hasRemainingTime ? formatRemaining(remaining) : 'unavailable';
}

function formatIndex(record) {
  const tabIndex = record.index;
  return isFiniteNumber(tabIndex) ? tabIndex + 1 : '';
}

function toDisplayText(value) {
  return value ? getUserActionLabel(value) || value : '';
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
