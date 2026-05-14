import { recomputeSortState } from './sort-state.js';
import { removeTabRecordFromStore } from './window-store-mutations.js';

export function removeTabRecord(tabId) {
  if (!removeTabRecordFromStore(tabId)) return false;
  recomputeSortState();
  return true;
}
