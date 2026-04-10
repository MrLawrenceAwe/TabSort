import { DEFAULT_SORT_OPTIONS } from './constants.js';

const getChromeApi = () => globalThis.chrome ?? null;
const getRuntimeLastError = () => getChromeApi()?.runtime?.lastError ?? null;

export function getStorageArea() {
  const chromeApi = getChromeApi();
  if (chromeApi?.storage?.sync) return chromeApi.storage.sync;
  if (chromeApi?.storage?.local) return chromeApi.storage.local;
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
        const runtimeError = getRuntimeLastError();
        if (runtimeError) {
          console.warn(`[TabSort] storage get failed: ${runtimeError.message}`);
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
        const runtimeError = getRuntimeLastError();
        if (runtimeError) {
          console.warn(`[TabSort] storage set failed: ${runtimeError.message}`);
        }
        resolve();
      });
    } catch (error) {
      console.warn(`[TabSort] storage set threw: ${error.message}`);
      resolve();
    }
  });
}
