export const DEFAULT_PREFERENCES = Object.freeze({
  groupOtherTabsBySite: false,
  openTikTokPipOnAutoPrepare: false,
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

function loadOptionsFromArea({ area, name }) {
  return new Promise((resolve) => {
    try {
      area.get(DEFAULT_PREFERENCES, (items) => {
        const runtimeError = getRuntimeLastError();
        if (runtimeError) {
          console.warn(`[TabSort] ${name} storage get failed: ${runtimeError.message}`);
          resolve(null);
          return;
        }
        resolve({ ...DEFAULT_PREFERENCES, ...items });
      });
    } catch (error) {
      console.warn(`[TabSort] ${name} storage get threw: ${error.message}`);
      resolve(null);
    }
  });
}

export async function loadPreferences() {
  for (const candidate of getStorageCandidates()) {
    const options = await loadOptionsFromArea(candidate);
    if (options) return options;
  }
  return { ...DEFAULT_PREFERENCES };
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

export async function savePreferences(update) {
  if (!update || typeof update !== 'object') return;
  for (const candidate of getStorageCandidates()) {
    if (await saveOptionsToArea(candidate, update)) return;
  }
}
