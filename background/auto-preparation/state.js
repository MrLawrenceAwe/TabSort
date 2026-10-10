export function createAutoPreparationState() {
  return { status: 'idle', total: 0, completed: 0, ready: 0, skipped: 0, currentTabId: null };
}

// The runner is the sole writer; consumers read defensive snapshots.
export const autoPreparationState = createAutoPreparationState();
export const getAutoPreparation = () => ({ ...autoPreparationState });
let preparationWindowId = null;
export const getPreparationWindowId = () => preparationWindowId;
export const setPreparationWindowId = id => { preparationWindowId = id; };
