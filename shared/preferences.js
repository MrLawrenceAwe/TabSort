export const DEFAULT_PREFERENCES = Object.freeze({
  groupOtherTabsBySite: false,
  openTikTokPipOnAutoPrepare: false,
});

const preferenceKeys = Object.keys(DEFAULT_PREFERENCES);

export async function loadPreferences() {
  const storage = globalThis.chrome?.storage;
  if (!storage?.local) return { ...DEFAULT_PREFERENCES };
  try {
    const saved = await storage.local.get(preferenceKeys);
    const missing = preferenceKeys.filter(key => !Object.hasOwn(saved, key));
    if (missing.length && storage.sync) {
      // Import existing settings once. Local values include previous failed-sync
      // writes and take precedence; runtime preferences now have one owner.
      const synced = await storage.sync.get(missing);
      const latest = await storage.local.get(preferenceKeys);
      const imported = Object.fromEntries(missing
        .filter(key => !Object.hasOwn(latest, key))
        .map(key => [key, synced[key] ?? DEFAULT_PREFERENCES[key]]));
      if (Object.keys(imported).length) await storage.local.set(imported);
      return { ...DEFAULT_PREFERENCES, ...saved, ...imported, ...latest };
    }
    return { ...DEFAULT_PREFERENCES, ...saved };
  } catch (error) {
    console.warn(`[TabSort] preference read failed: ${error.message}`);
    // A failed import must not hide previously saved local preferences.
    try { return { ...DEFAULT_PREFERENCES, ...await storage.local.get(preferenceKeys) }; }
    catch { return { ...DEFAULT_PREFERENCES }; }
  }
}

export async function savePreferences(update) {
  const local = globalThis.chrome?.storage?.local;
  if (!local || !update || typeof update !== 'object') return;
  const values = Object.fromEntries(preferenceKeys
    .filter(key => typeof update[key] === 'boolean')
    .map(key => [key, update[key]]));
  if (Object.keys(values).length) await local.set(values);
}
