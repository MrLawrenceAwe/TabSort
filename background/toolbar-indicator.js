import { logDebug } from '../shared/log.js';

const DEFAULT_TITLE = 'TabSort';
const COMPLETE_TITLE = 'TabSort — Auto-prepare complete';
const RUNNING_COLOR = '#1a73e8';
const COMPLETE_COLOR = '#188038';
export const DONE_BADGE_DURATION_MS = 3000;
const DEFAULT_TIMER = {
  set: (callback, delay) => setTimeout(callback, delay),
  clear: timerId => clearTimeout(timerId),
};

let pendingToolbarUpdate = Promise.resolve();
let toolbarStateGeneration = 0;
let scheduledBadgeClear = null;

function getRunningIndicator(state) {
  if (!Number.isInteger(state?.total) || state.total <= 0) {
    return { badgeText: '…', title: 'TabSort — Auto-preparing tabs…' };
  }

  const completed = Number.isInteger(state.completed) ? Math.max(0, state.completed) : 0;
  const activeOffset = state.currentTabId == null ? 0 : 1;
  const current = Math.min(state.total, completed + activeOffset);
  const progress = `${current}/${state.total}`;
  return { badgeText: progress, title: `TabSort — Auto-preparing tabs ${progress}` };
}

export async function updateAutoPreparationToolbarIndicator(state, action = chrome.action) {
  if (!action) return;

  const running = state?.status === 'running';
  const complete = state?.status === 'complete';
  const runningIndicator = running ? getRunningIndicator(state) : null;
  const badgeText = runningIndicator?.badgeText ?? (complete ? 'DONE' : '');
  const title = runningIndicator?.title ?? (complete ? COMPLETE_TITLE : DEFAULT_TITLE);
  const color = running ? RUNNING_COLOR : complete ? COMPLETE_COLOR : null;
  try {
    await Promise.all([
      action.setBadgeText({ text: badgeText }),
      action.setTitle({ title }),
      ...(color ? [action.setBadgeBackgroundColor({ color })] : []),
    ]);
  } catch (error) {
    logDebug('toolbar indicator update failed', error);
  }
}

function enqueueToolbarUpdate(state, action) {
  pendingToolbarUpdate = pendingToolbarUpdate
    .catch(error => logDebug('toolbar indicator queue failed', error))
    .then(() => updateAutoPreparationToolbarIndicator(state, action));
  return pendingToolbarUpdate;
}

// State publications can arrive faster than Chrome applies action updates. Keep
// their side effects in lifecycle order so an older running state cannot erase
// a newer completion badge.
export function queueAutoPreparationToolbarIndicator(
  state,
  action = chrome.action,
  timer = DEFAULT_TIMER,
) {
  const generation = ++toolbarStateGeneration;
  if (scheduledBadgeClear) {
    scheduledBadgeClear.cancel(scheduledBadgeClear.id);
    scheduledBadgeClear = null;
  }

  const update = enqueueToolbarUpdate(state, action);
  if (state?.status === 'complete') {
    void update.then(() => {
      if (generation !== toolbarStateGeneration) return;
      const clearBadge = () => {
        if (generation !== toolbarStateGeneration) return pendingToolbarUpdate;
        toolbarStateGeneration += 1;
        scheduledBadgeClear = null;
        return enqueueToolbarUpdate({ status: 'idle' }, action);
      };
      scheduledBadgeClear = {
        id: timer.set(clearBadge, DONE_BADGE_DURATION_MS),
        cancel: timer.clear,
      };
    });
  }
  return update;
}
