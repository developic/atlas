/**
 * Single source of truth for the Atlas color theme.
 *
 * The theme is applied in two places, and both read their rules from here:
 *
 *  - `themeToggle` runs inline in <head> before first paint, so the
 *    correct theme is on screen before React hydrates.
 *  - `applyTheme` / `subscribeToTheme` back the React store in `theme-toggle.tsx`,
 *    which owns everything that happens after hydration.
 *
 * The inline script is serialized to a string and evaluated as plain JavaScript,
 * so it cannot reference anything in this module. Every value it needs is
 * interpolated from the constants below — that is what keeps the two halves of
 * the theme contract from drifting apart.
 */

const LIGHT_THEME = "light";
const DARK_THEME = "dark";

export type Theme = typeof LIGHT_THEME | typeof DARK_THEME;

export const THEME_STORAGE_KEY = "theme";
export const THEME_CHANGE_EVENT = "atlas-theme-change";

/** CSS class that activates the dark token block in `globals.css`. */
const DARK_CLASS = "dark";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Renders a value as a JavaScript string literal for the inline script. */
const scriptLiteral = (value: string) => JSON.stringify(value);

function isTheme(value: string | null): value is Theme {
  return value === LIGHT_THEME || value === DARK_THEME;
}

export function getSystemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? DARK_THEME : LIGHT_THEME;
}

/** The persisted explicit choice, or `null` when the user follows the system. */
export function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    // localStorage can be unavailable in private browsing.
    return null;
  }
}

/** The DOM is the source of truth once the page is live. */
export function getTheme(): Theme {
  return document.documentElement.classList.contains(DARK_CLASS)
    ? DARK_THEME
    : LIGHT_THEME;
}

export function applyTheme(theme: Theme, persist = false) {
  const root = document.documentElement;

  root.classList.toggle(DARK_CLASS, theme === DARK_THEME);
  root.style.colorScheme = theme;

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The theme still applies for this session, it just won't be remembered.
    }
  }

  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** Server render has no access to storage or the media query, so assume light. */
export function getServerTheme(): Theme {
  return LIGHT_THEME;
}

/**
 * Subscribes the React store to every source that can change the theme:
 * this tab's toggles, other tabs, and the OS preference when nothing is stored.
 */
export function subscribeToTheme(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);

  const handleSystemChange = (event: MediaQueryListEvent) => {
    if (getStoredTheme() === null) {
      applyTheme(event.matches ? DARK_THEME : LIGHT_THEME);
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) {
      return;
    }

    applyTheme(isTheme(event.newValue) ? event.newValue : getSystemTheme());
  };

  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", handleStorage);
  media.addEventListener("change", handleSystemChange);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
    media.removeEventListener("change", handleSystemChange);
  };
}

/**
 * Injected in <head> before first paint. Kept in sync with the runtime store by
 * construction: every literal below comes from the constants above, and the
 * fallback order (stored choice, then system) matches `getStoredTheme` /
 * `getSystemTheme`. A storage failure must not skip applying the theme.
 */
export const themeToggle = `
(function () {
  var stored = null;

  try {
    stored = localStorage.getItem(${scriptLiteral(THEME_STORAGE_KEY)});
  } catch (error) {
    stored = null;
  }

  var theme =
    stored === ${scriptLiteral(LIGHT_THEME)} || stored === ${scriptLiteral(DARK_THEME)}
      ? stored
      : window.matchMedia(${scriptLiteral(DARK_QUERY)}).matches
        ? ${scriptLiteral(DARK_THEME)}
        : ${scriptLiteral(LIGHT_THEME)};

  var root = document.documentElement;
  root.classList.toggle(${scriptLiteral(DARK_CLASS)}, theme === ${scriptLiteral(DARK_THEME)});
  root.style.colorScheme = theme;
})();
`.trim();
