export const DEFAULT_SORT_OPTIONS = Object.freeze({
  groupOtherTabsBySite: false,
});

const getChromeApi = () => globalThis.chrome ?? null;
const getRuntimeLastError = () => getChromeApi()?.runtime?.lastError ?? null;

function getStorageCandidates() {
  const storage = getChromeApi()?.storage;
  const candidates = [];
  if (storage?.sync) candidates.push({ area: storage.sync, name: 'sync' });
  if (storage?.local && storage.local !== storage.sync) {
    candidates.push({ area: storage.local, name: 'local' });
  }
  return candidates;
}

export function getStorageArea() {
  return getStorageCandidates()[0]?.area ?? null;
}

function loadOptionsFromArea({ area, name }) {
  return new Promise((resolve) => {
    try {
      area.get(DEFAULT_SORT_OPTIONS, (items) => {
        const runtimeError = getRuntimeLastError();
        if (runtimeError) {
          console.warn(`[TabSort] ${name} storage get failed: ${runtimeError.message}`);
          resolve(null);
          return;
        }
        resolve({ ...DEFAULT_SORT_OPTIONS, ...items });
      });
    } catch (error) {
      console.warn(`[TabSort] ${name} storage get threw: ${error.message}`);
      resolve(null);
    }
  });
}

export async function loadSortOptions() {
  for (const candidate of getStorageCandidates()) {
    const options = await loadOptionsFromArea(candidate);
    if (options) return options;
  }
  return { ...DEFAULT_SORT_OPTIONS };
}

function saveOptionsToArea({ area, name }, update) {
  return new Promise((resolve) => {
    try {
      area.set(update, () => {
        const runtimeError = getRuntimeLastError();
        if (runtimeError) {
          console.warn(`[TabSort] ${name} storage set failed: ${runtimeError.message}`);
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (error) {
      console.warn(`[TabSort] ${name} storage set threw: ${error.message}`);
      resolve(false);
    }
  });
}

export async function saveSortOptions(update) {
  if (!update || typeof update !== 'object') return;
  for (const candidate of getStorageCandidates()) {
    if (await saveOptionsToArea(candidate, update)) return;
  }
}
