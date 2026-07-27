import { isFiniteNumber } from '../shared/guards.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import {
  determineTabGuidance,
  getTabGuidanceLabel,
  TAB_GUIDANCE,
} from '../shared/tab-readiness/action-guidance.js';

const COLUMNS = Object.freeze({
  sorted: [
    { key: 'remainingStatus', getter: formatRemainingStatus },
    { key: 'index', getter: formatIndex },
  ],
  planning: [
    { key: 'remainingStatus', getter: formatRemainingStatus },
    { key: 'index', getter: formatIndex },
    { key: 'status', getter: (record) => record.loadState },
  ],
});

export function renderTabRow(row, tabRecord, isSortComplete, requestTabAction) {
  row.insertCell(0).textContent = tabRecord.videoDetails?.title ?? tabRecord.url;

  const guidance = determineTabGuidance(tabRecord);
  if (guidance === TAB_GUIDANCE.RELOAD_TAB) {
    row.classList.add('reload-required-row');
  }
  if (!isSortComplete) {
    insertGuidanceCell(row, tabRecord, guidance, requestTabAction);
  }

  insertInfoCells(row, tabRecord, isSortComplete, guidance);

  const remaining = tabRecord?.videoDetails?.remainingTime;
  const hasRemainingTime = isFiniteNumber(remaining) && !tabRecord.remainingTimeStale;
  if (hasRemainingTime && !isSortComplete) row.classList.add('sort-ready-row');
}

function insertInfoCells(row, record, isSortComplete, guidance) {
  const columns = isSortComplete
    ? COLUMNS.sorted
    : COLUMNS.planning;

  columns.forEach((column) => {
    const cell = row.insertCell(row.cells.length);
    const value = column.getter(record, guidance);
    cell.textContent = isSortComplete ? value : toDisplayText(value);
  });
}

function insertGuidanceCell(row, record, guidance, requestTabAction) {
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

  const actionButton = createActionButton(
    getTabGuidanceLabel(guidance),
    guidance === TAB_GUIDANCE.RELOAD_TAB
      ? RUNTIME_MESSAGE_TYPES.RELOAD_TAB
      : RUNTIME_MESSAGE_TYPES.OPEN_TAB,
    record.id,
    requestTabAction,
  );
  cell.appendChild(actionButton);
}

function createActionButton(text, actionType, tabId, requestTabAction) {
  const actionButton = document.createElement('button');
  actionButton.type = 'button';
  actionButton.classList.add('user-action-button');
  actionButton.textContent = text;
  actionButton.addEventListener('click', async () => {
    const originalText = actionButton.textContent;
    actionButton.disabled = true;
    actionButton.setAttribute?.('aria-busy', 'true');
    actionButton.textContent = actionType === RUNTIME_MESSAGE_TYPES.RELOAD_TAB
      ? 'Reloading…'
      : 'Opening…';
    const didSucceed = await requestTabAction?.(actionType, { tabId });
    if (!didSucceed) {
      actionButton.disabled = false;
      actionButton.removeAttribute?.('aria-busy');
      actionButton.textContent = originalText;
    }
  });
  return actionButton;
}

export function formatRemainingStatus(record, requiredAction = determineTabGuidance(record)) {
  if (record.isLive) return 'Live Stream';

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
