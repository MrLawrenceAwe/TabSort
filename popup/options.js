import { DEFAULT_SORT_OPTIONS } from '../shared/constants.js';
import { loadSortOptions, persistSortOptions } from '../shared/storage.js';
import { startThemeSync } from './theme.js';

export function getCurrentSortOptions() {
  const groupNonYoutubeToggle = document.getElementById('groupNonYoutubeTabsToggle');

  return {
    ...DEFAULT_SORT_OPTIONS,
    groupNonYoutubeTabsByDomain: Boolean(groupNonYoutubeToggle?.checked),
  };
}

export async function setupOptionControls({ onChange } = {}) {
  startThemeSync();
  const options = await loadSortOptions();
  const groupNonYoutubeToggle = document.getElementById('groupNonYoutubeTabsToggle');

  if (groupNonYoutubeToggle) {
    groupNonYoutubeToggle.checked = Boolean(options.groupNonYoutubeTabsByDomain);
    groupNonYoutubeToggle.addEventListener('change', () => {
      const nextOptions = getCurrentSortOptions();
      void persistSortOptions(nextOptions);
      if (typeof onChange === 'function') {
        void Promise.resolve(onChange(nextOptions));
      }
    });
  }
}
