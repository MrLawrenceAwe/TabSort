import { createEmptySortSummary } from '../shared/sort-summary.js';

export function createWindowSessionStateShape() {
  return {
    tabRecordsById: {},
    targetSortableTabIds: [],
    visibleTabIds: [],
    currentOrderMatchesTarget: false,
    sortSummary: createEmptySortSummary(),
    windowId: null,
    snapshotSignature: null,
    syncToken: 0,
  };
}

export const windowSessionState = createWindowSessionStateShape();
