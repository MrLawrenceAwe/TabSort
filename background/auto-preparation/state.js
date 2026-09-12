let progressWindowId = null;
let autoPreparation = { status: 'idle', total: 0, completed: 0, ready: 0, skipped: 0, currentTabId: null };
export const getAutoPreparation = () => ({ ...autoPreparation });
export const setAutoPreparation = value => { autoPreparation = { ...value }; };
export const getProgressWindowId = () => progressWindowId;
export const setProgressWindowId = id => { progressWindowId = id; };
