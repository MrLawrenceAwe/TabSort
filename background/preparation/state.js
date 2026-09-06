let progressWindowId = null;
let preparation = { status: 'idle', total: 0, completed: 0, ready: 0, skipped: 0, currentTabId: null };
export const getPreparation = () => ({ ...preparation });
export const setPreparation = value => { preparation = { ...value }; };
export const getProgressWindowId = () => progressWindowId;
export const setProgressWindowId = id => { progressWindowId = id; };
