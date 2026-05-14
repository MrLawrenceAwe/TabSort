import { isFiniteNumber } from '../shared/guards.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import {
  determineTabGuidance,
  getTabGuidanceLabel,
  TAB_GUIDANCE,
} from '../shared/tab-resolution-guidance.js';

const CLICKABLE_GUIDANCE_MESSAGES = Object.freeze({
  ACTIVATE_TAB: RUNTIME_MESSAGE_TYPES.ACTIVATE_TAB,
  RELOAD_TAB: RUNTIME_MESSAGE_TYPES.RELOAD_TAB,
});

const ROW_VIEW_COLUMNS = Object.freeze({
  sortedView: [
    { key: 'remainingStatus', getter: formatRemainingStatus },
    { key: 'index', getter: formatIndex },
  ],
  planningView: [
    { key: 'remainingStatus', getter: formatRemainingStatus },
    { key: 'index', getter: formatIndex },
    { key: 'status', getter: (record) => record.status },
  ],
});

export function renderTabRow(row, tabRecord, allEligibleVideosSorted, postRuntimeMessage) {
  row.insertCell(0).textContent = tabRecord.videoDetails?.title ?? tabRecord.url;

  const guidance = determineTabGuidance(tabRecord);
  if (guidance === TAB_GUIDANCE.RELOAD_TAB) {
    row.classList.add('reload-required-row');
  }
  if (!allEligibleVideosSorted) {
    insertGuidanceCell(row, tabRecord, guidance, postRuntimeMessage);
  }

  insertInfoCells(row, tabRecord, allEligibleVideosSorted, guidance);

  const remaining = tabRecord?.videoDetails?.remainingTime;
  const hasRemainingTime = isFiniteNumber(remaining) && !tabRecord.remainingTimeStale;
  if (hasRemainingTime && !allEligibleVideosSorted) row.classList.add('sort-ready-row');
}

function insertInfoCells(row, record, allEligibleVideosSorted, guidance) {
  const columns = allEligibleVideosSorted
    ? ROW_VIEW_COLUMNS.sortedView
    : ROW_VIEW_COLUMNS.planningView;

  columns.forEach((column) => {
    const cell = row.insertCell(row.cells.length);
    const value = column.getter(record, guidance);
    cell.textContent = allEligibleVideosSorted ? value : toDisplayText(value);
  });
}

function insertGuidanceCell(row, record, guidance, postRuntimeMessage) {
  const cell = row.insertCell(1);
  if (
    guidance === TAB_GUIDANCE.NONE ||
    guidance === TAB_GUIDANCE.WAIT_FOR_LOAD ||
    guidance === TAB_GUIDANCE.WAIT_FOR_VIDEO_DATA
  ) {
    cell.textContent =
      guidance === TAB_GUIDANCE.NONE ? '—' : getTabGuidanceLabel(guidance);
    return;
  }

  const linkElement = createActionLink(
    getTabGuidanceLabel(guidance),
    guidance === TAB_GUIDANCE.RELOAD_TAB
      ? CLICKABLE_GUIDANCE_MESSAGES.RELOAD_TAB
      : CLICKABLE_GUIDANCE_MESSAGES.ACTIVATE_TAB,
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

export function formatRemainingStatus(record, requiredAction = determineTabGuidance(record)) {
  if (record.isLiveNow) return 'Live Stream';

  const remaining = record?.videoDetails?.remainingTime;
  const hasRemainingTime = isFiniteNumber(remaining);

  if (record.remainingTimeStale) {
    return requiredAction === TAB_GUIDANCE.VIEW_TAB_TO_REFRESH_TIME
      ? getTabGuidanceLabel(TAB_GUIDANCE.VIEW_TAB_TO_REFRESH_TIME)
      : 'unavailable';
  }

  return hasRemainingTime ? formatRemaining(remaining) : 'unavailable';
}

function formatIndex(record) {
  const tabIndex = record.index;
  return isFiniteNumber(tabIndex) ? tabIndex + 1 : '';
}

function toDisplayText(value) {
  return value ? getTabGuidanceLabel(value) || value : '';
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
