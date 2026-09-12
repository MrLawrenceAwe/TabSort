export const DEFAULT_PREFERENCES = Object.freeze({
  groupOtherTabsBySite: false,
  openTikTokPipOnAutoPrepare: false,
});

const getChromeApi = () => globalThis.chrome ?? null;

function getStorageCandidates() {
  const storage = getChromeApi()?.storage;
  const candidates = [];
  if (storage?.sync) candidates.push({ area: storage.sync, name: 'sync' });
  if (storage?.local && storage.local !== storage.sync) {
    candidates.push({ area: storage.local, name: 'local' });
  }
  return candidates;
}

async function loadOptionsFromArea({ area, name }) {
  try {
    return { ...DEFAULT_PREFERENCES, ...await area.get(DEFAULT_PREFERENCES) };
  } catch (error) {
    console.warn(`[TabSort] ${name} storage get failed: ${error.message}`);
    return null;
  }
}

export async function loadPreferences() {
  for (const candidate of getStorageCandidates()) {
    const options = await loadOptionsFromArea(candidate);
    if (options) return options;
  }
  return { ...DEFAULT_PREFERENCES };
}

async function saveOptionsToArea({ area, name }, update) {
  try {
    await area.set(update);
    return true;
  } catch (error) {
    console.warn(`[TabSort] ${name} storage set failed: ${error.message}`);
    return false;
  }
}

export async function savePreferences(update) {
  if (!update || typeof update !== 'object') return;
  for (const candidate of getStorageCandidates()) {
    if (await saveOptionsToArea(candidate, update)) return;
  }
}
