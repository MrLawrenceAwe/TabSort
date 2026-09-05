import { hasReadyRemainingTime } from '../shared/tabs/sort-readiness.js';
import { isFiniteNumber } from '../shared/guards.js';
import { RUNTIME_MESSAGE_TYPES } from '../shared/messages.js';
import {
  determineTabGuidance,
  getTabGuidanceLabel,
  TAB_GUIDANCE,
} from '../shared/tabs/guidance.js';

const COLUMNS = Object.freeze([
  { key: 'remaining-time', getter: formatRemainingStatus },
  { key: 'tab-position', getter: formatPosition },
]);

export function renderTabRow(row, tabRecord, isTargetOrderApplied, requestTabAction) {
  const titleCell = row.insertCell(0);
  titleCell.textContent = tabRecord.videoDetails?.title ?? tabRecord.url;
  titleCell.title = titleCell.textContent;

  const guidance = determineTabGuidance(tabRecord);
  if (guidance === TAB_GUIDANCE.RELOAD_TAB) {
    row.classList.add('reload-required-row');
  }
  if (!isTargetOrderApplied) {
    insertGuidanceCell(row, tabRecord, guidance, requestTabAction);
  }

  insertInfoCells(row, tabRecord, guidance);

  const isReadyToSort = !tabRecord.pinned && !tabRecord.isLive && hasReadyRemainingTime(tabRecord);
  if (isReadyToSort && !isTargetOrderApplied) row.classList.add('ready-row');
}

function insertInfoCells(row, record, guidance) {
  COLUMNS.forEach((column) => {
    const cell = row.insertCell(row.cells.length);
    cell.className = column.key;
    const value = column.getter(record, guidance);
    cell.textContent = value;
  });
}

function insertGuidanceCell(row, record, guidance, requestTabAction) {
  const cell = row.insertCell(1);
  cell.className = 'next-step';
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
    row.ownerDocument ?? globalThis.document,
    getTabGuidanceLabel(guidance),
    guidance === TAB_GUIDANCE.RELOAD_TAB
      ? RUNTIME_MESSAGE_TYPES.RELOAD_TAB
      : RUNTIME_MESSAGE_TYPES.ACTIVATE_TAB,
    record.id,
    requestTabAction,
  );
  cell.appendChild(actionButton);
}

function createActionButton(runtimeDocument, text, actionType, tabId, requestTabAction) {
  const actionButton = runtimeDocument.createElement('button');
  actionButton.type = 'button';
  actionButton.classList.add('user-action-button');
  actionButton.textContent = text;
  actionButton.addEventListener('click', async () => {
    const originalText = actionButton.textContent;
    actionButton.disabled = true;
    actionButton.setAttribute?.('aria-busy', 'true');
    actionButton.textContent = actionType === RUNTIME_MESSAGE_TYPES.RELOAD_TAB
      ? 'Reloading…'
      : 'Switching…';
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

  const remaining = record?.videoDetails?.remainingSeconds;
  const hasRemainingTime = isFiniteNumber(remaining);

  if (record.remainingSecondsStale) {
    return requiredAction === TAB_GUIDANCE.VIEW_TAB_TO_REFRESH_TIME
      ? getTabGuidanceLabel(TAB_GUIDANCE.VIEW_TAB_TO_REFRESH_TIME)
      : 'unavailable';
  }

  return hasRemainingTime ? formatRemaining(remaining) : 'unavailable';
}

function formatPosition(record) {
  const tabIndex = record.index;
  return isFiniteNumber(tabIndex) ? tabIndex + 1 : '';
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
