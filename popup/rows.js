import { TAB_STATES } from '../shared/constants.js';
import { popupState } from './state.js';
import { sendMessageWithWindow } from './runtime.js';

const USER_ACTIONS = {
  RELOAD_TAB: 'Reload tab',
  INTERACT_WITH_TAB: 'Interact with tab',
  FACILITATE_LOAD: 'Facilitate load',
  INTERACT_WITH_TAB_THEN_RELOAD: 'Interact with tab/Reload tab',
  VIEW_TAB_TO_REFRESH_TIME: 'View tab to refresh time',
  NO_ACTION: '',
};

export function insertRowCells(row, tabRecord, isSortedView) {
  const ACTIVATE_TAB = 'activateTab';
  const RELOAD_TAB_ACTION = 'reloadTab';

  row.insertCell(0).textContent = tabRecord.videoDetails?.title ?? tabRecord.url;

  const userAction = determineUserAction(tabRecord);
  if (!isSortedView) insertUserActionCell(row, tabRecord, userAction);

  insertInfoCells(row, tabRecord, isSortedView);

  const remaining = tabRecord?.videoDetails?.remainingTime;
  const hasRemainingTime = typeof remaining === 'number' && isFinite(remaining);
  if (hasRemainingTime && !isSortedView) row.classList.add('ready-row');

  function insertInfoCells(r, record, sortedView) {
    const RECORD_KEYS = sortedView ? ['videoDetails', 'index'] : ['videoDetails', 'index', 'status'];

    RECORD_KEYS.forEach((key, i) => {
      const offset = sortedView ? 1 : 2;
      const cell = r.insertCell(i + offset);

      let value = record[key];
      if (key === 'videoDetails') {
        if (record.remainingTimeMayBeStale) {
          value = 'View tab to refresh time';
        } else {
          const rt2 = record?.videoDetails?.remainingTime;
          value =
            typeof rt2 === 'number' && isFinite(rt2)
              ? !record.isLiveStream
                ? formatRemaining(rt2)
                : 'Live Stream'
              : 'unavailable';
        }
      }
      if (key === 'index') value = Number.isFinite(value) ? value + 1 : '';

      cell.textContent = popupState.tabsInCurrentWindowAreKnownToBeSorted
        ? value
        : getFallbackValue(key, value);
    });
  }

  function insertUserActionCell(r, record, action) {
    const cell = r.insertCell(1);
    if (!action) {
      cell.textContent = '—';
      return;
    }
    if (action === USER_ACTIONS.INTERACT_WITH_TAB_THEN_RELOAD) {
      const interact = createLink(USER_ACTIONS.INTERACT_WITH_TAB, ACTIVATE_TAB, record.id);
      const reload = createLink(USER_ACTIONS.RELOAD_TAB, RELOAD_TAB_ACTION, record.id);
      cell.appendChild(interact);
      cell.appendChild(document.createTextNode('/'));
      cell.appendChild(reload);
      return;
    }
    const link = createLink(
      action,
      action === USER_ACTIONS.RELOAD_TAB ? RELOAD_TAB_ACTION : ACTIVATE_TAB,
      record.id,
    );
    cell.appendChild(link);
  }

  function createLink(text, messageAction, tabId) {
    const a = document.createElement('a');
    a.href = '#';
    a.classList.add('user-action-link');
    a.textContent = text;
    a.addEventListener('click', () => sendMessageWithWindow(messageAction, { tabId }));
    return a;
  }

  function getFallbackValue(key, value) {
    if (value) return value;
    if (key === 'contentScriptReady' || key === 'metadataLoaded') return false;
    return USER_ACTIONS.NO_ACTION;
  }
}

function formatRemaining(seconds) {
  if (typeof seconds !== 'number' || !isFinite(seconds)) return '—';
  const totalMinutes = Math.floor(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const s = Math.floor(seconds % 60);
  return h < 1 ? `${m}m ${s}s` : `${h}h ${m}m ${s}s`;
}

function determineUserAction(tabRecord) {
  if (tabRecord?.remainingTimeMayBeStale) {
    return USER_ACTIONS.VIEW_TAB_TO_REFRESH_TIME;
  }

  const videoDetails = tabRecord?.videoDetails;
  const hasRemainingTime =
    typeof videoDetails?.remainingTime === 'number' && isFinite(videoDetails.remainingTime);

  const recentlyUnsuspended =
    tabRecord.unsuspendedTimestamp && Date.now() - tabRecord.unsuspendedTimestamp < 5000;

  if (!hasRemainingTime) {
    switch (tabRecord.status) {
      case TAB_STATES.UNSUSPENDED:
        if (recentlyUnsuspended) return USER_ACTIONS.NO_ACTION;
        if (tabRecord.isActiveTab || !tabRecord.contentScriptReady) return USER_ACTIONS.RELOAD_TAB;
        return USER_ACTIONS.INTERACT_WITH_TAB_THEN_RELOAD;
      case TAB_STATES.SUSPENDED:
        return USER_ACTIONS.INTERACT_WITH_TAB;
      case TAB_STATES.LOADING:
        return USER_ACTIONS.FACILITATE_LOAD;
      default:
        return USER_ACTIONS.NO_ACTION;
    }
  }

  return USER_ACTIONS.NO_ACTION;
}
