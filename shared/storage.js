import { DEFAULT_SORT_OPTIONS } from './constants.js';

export function getStorageArea() {
  if (chrome?.storage?.sync) return chrome.storage.sync;
  if (chrome?.storage?.local) return chrome.storage.local;
  return null;
}

export function loadSortOptions() {
  const storage = getStorageArea();
  return new Promise((resolve) => {
    if (!storage) {
      resolve({ ...DEFAULT_SORT_OPTIONS });
      return;
    }
    try {
      storage.get(DEFAULT_SORT_OPTIONS, (items) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.warn(`[TabSort] storage get failed: ${err.message}`);
          resolve({ ...DEFAULT_SORT_OPTIONS });
          return;
        }
        resolve({ ...DEFAULT_SORT_OPTIONS, ...items });
      });
    } catch (error) {
      console.warn(`[TabSort] storage get threw: ${error.message}`);
      resolve({ ...DEFAULT_SORT_OPTIONS });
    }
  });
}

export function persistSortOptions(update) {
  const storage = getStorageArea();
  return new Promise((resolve) => {
    if (!storage || !update || typeof update !== 'object') {
      resolve();
      return;
    }
    try {
      storage.set(update, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.warn(`[TabSort] storage set failed: ${err.message}`);
        }
        resolve();
      });
    } catch (error) {
      console.warn(`[TabSort] storage set threw: ${error.message}`);
      resolve();
    }
  });
}
