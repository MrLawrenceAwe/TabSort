import { logDebug } from '../shared/log.js';

const DEFAULT_TITLE = 'TabSort';
const COMPLETE_TITLE = 'TabSort — Auto-prepare complete';
let pendingToolbarUpdate = Promise.resolve();

// The action badge persists independently of the popup, so completion remains
// visible after a background run has finished.
export async function updateAutoPreparationToolbarIndicator(state, action = chrome.action) {
  if (!action) return;

  const complete = state?.status === 'complete';
  try {
    await Promise.all([
      action.setBadgeText({ text: complete ? 'DONE' : '' }),
      action.setTitle({ title: complete ? COMPLETE_TITLE : DEFAULT_TITLE }),
      ...(complete ? [action.setBadgeBackgroundColor({ color: '#188038' })] : []),
    ]);
  } catch (error) {
    logDebug('toolbar indicator update failed', error);
  }
}

// State publications can arrive faster than Chrome applies action updates. Keep
// their side effects in lifecycle order so an older running state cannot erase
// a newer completion badge.
export function queueAutoPreparationToolbarIndicator(state, action = chrome.action) {
  pendingToolbarUpdate = pendingToolbarUpdate
    .catch(error => logDebug('toolbar indicator queue failed', error))
    .then(() => updateAutoPreparationToolbarIndicator(state, action));
  return pendingToolbarUpdate;
}
