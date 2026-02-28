const THEMES = Object.freeze({
  LIGHT: 'light',
  DARK: 'dark',
});

let syncing = false;
let activeMediaQuery = null;

function normalizeTheme(theme) {
  return theme === THEMES.LIGHT ? THEMES.LIGHT : THEMES.DARK;
}

function getPreferredTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return THEMES.DARK;
  }

  try {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    return mediaQuery.matches ? THEMES.DARK : THEMES.LIGHT;
  } catch {
    return THEMES.DARK;
  }
}

export function applyTheme(theme) {
  const normalizedTheme = normalizeTheme(theme);
  const root = document.documentElement;
  const body = document.body;

  if (root) {
    root.setAttribute('data-theme', normalizedTheme);
  }

  if (body) {
    body.setAttribute('data-theme', normalizedTheme);
  }
}

function detachMediaQueryListener() {
  if (!activeMediaQuery) return;

  if (typeof activeMediaQuery.removeEventListener === 'function') {
    activeMediaQuery.removeEventListener('change', handleMediaChange);
  } else if (typeof activeMediaQuery.removeListener === 'function') {
    activeMediaQuery.removeListener(handleMediaChange);
  }

  activeMediaQuery = null;
}

function handleMediaChange(event) {
  applyTheme(event.matches ? THEMES.DARK : THEMES.LIGHT);
}

export function startThemeSync() {
  applyTheme(getPreferredTheme());

  if (syncing) {
    return;
  }

  syncing = true;

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return;
  }

  try {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    activeMediaQuery = mediaQuery;

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleMediaChange);
    }

    window.addEventListener(
      'unload',
      () => {
        detachMediaQueryListener();
        syncing = false;
      },
      { once: true },
    );
  } catch {}
}
