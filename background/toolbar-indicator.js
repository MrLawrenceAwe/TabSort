import { logDebug } from '../shared/log.js';

const DEFAULT_TITLE = 'TabSort';
const COMPLETE_TITLE = 'TabSort — Auto-prepare complete';

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
