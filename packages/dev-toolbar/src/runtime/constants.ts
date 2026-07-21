export const ECOPAGES_DOCS_URL = 'https://ecopages.app';

export const DEV_TOOLBAR_ELEMENT_NAME = 'eco-dev-toolbar';
export const DEV_TOOLBAR_PERSIST_KEY = 'eco-dev-toolbar';
export const DEV_TOOLBAR_PLACEMENT_STORAGE_KEY = 'ecopages:dev-toolbar:placement';
export const DEV_TOOLBAR_STEALTH_STORAGE_KEY = 'ecopages:dev-toolbar:stealth';
export const DEV_TOOLBAR_NAVIGATION_APP_ID = 'navigation';

/** Full-opacity dwell after hover ends, before the fade phase. */
export const DEV_TOOLBAR_STEALTH_DWELL_MS = 4_000;

/** Partial-opacity fade before the dock hides off-screen. */
export const DEV_TOOLBAR_STEALTH_FADE_MS = 4_000;

/** Total idle time before the dock is fully hidden in stealth mode. */
export const DEV_TOOLBAR_STEALTH_IDLE_MS = DEV_TOOLBAR_STEALTH_DWELL_MS + DEV_TOOLBAR_STEALTH_FADE_MS;

/** Wait before showing the navigation dock spinner during route changes. */
export const DEV_TOOLBAR_NAVIGATION_LOADING_DELAY_MS = 100;

/** Clears navigation loading if no lifecycle end event arrives. */
export const DEV_TOOLBAR_NAVIGATION_LOADING_TIMEOUT_MS = 8_000;

/** Client navigation rows shown per page in the Navigation panel. */
export const DEV_TOOLBAR_NAV_HISTORY_PAGE_SIZE = 8;

/** Debounce route-driven deps refresh to avoid rapid manifest churn. */
export const DEV_TOOLBAR_DEPS_REFRESH_DEBOUNCE_MS = 250;
