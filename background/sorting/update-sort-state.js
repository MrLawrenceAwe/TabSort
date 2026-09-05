import { broadcastSnapshotUpdate } from '../tab-snapshot.js';
import { deriveSortState } from './derive-state.js';
import {
  getOrderedWindowTabs,
  listTabRecords,
  setSortState,
} from '../windows/store.js';

export function updateSortStateAndBroadcast() {
  const records = listTabRecords();
  const derivedState = deriveSortState(records, {
    orderedWindowTabs: getOrderedWindowTabs(),
  });
  setSortState(derivedState);
  broadcastSnapshotUpdate();
}
