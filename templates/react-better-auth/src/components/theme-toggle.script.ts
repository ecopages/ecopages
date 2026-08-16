const PREFERENCES = ['system', 'light', 'dark'] as const;
type ThemePreference = (typeof PREFERENCES)[number];

const DARK_THEME_QUERY = '(prefers-color-scheme: dark)';
const STORAGE_KEY = 'theme';

function normalizePreference(value: string | null): ThemePreference {
	return PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
}

function applyTheme(preference: ThemePreference): void {
	const dark = preference === 'dark' || (preference === 'system' && window.matchMedia(DARK_THEME_QUERY).matches);
	document.documentElement.classList.toggle('dark', dark);
	document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

function preferenceLabel(preference: ThemePreference): string {
	return `${preference[0].toUpperCase()}${preference.slice(1)}`;
}

function syncToggles(preference: ThemePreference): void {
	const text = preferenceLabel(preference);
	for (const toggle of document.querySelectorAll<HTMLElement>('[data-theme-toggle]')) {
		toggle.dataset.value = preference;
		toggle.setAttribute('aria-label', `Theme: ${text}`);
		const label = toggle.querySelector<HTMLElement>('.theme-toggle__label');
		if (label) {
			label.textContent = text;
		}
	}
}

function setPreference(preference: ThemePreference): void {
	localStorage.setItem(STORAGE_KEY, preference);
	applyTheme(preference);
	syncToggles(preference);
}

let preference = normalizePreference(typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY));

function syncFromStorage(): void {
	preference = normalizePreference(localStorage.getItem(STORAGE_KEY));
	setPreference(preference);
}

document.addEventListener('click', (event) => {
	const target = event.target;
	if (!(target instanceof Element)) {
		return;
	}

	if (!target.closest('[data-theme-toggle]')) {
		return;
	}

	preference = PREFERENCES[(PREFERENCES.indexOf(preference) + 1) % PREFERENCES.length];
	setPreference(preference);
});

window.matchMedia(DARK_THEME_QUERY).addEventListener('change', () => {
	if (preference === 'system') {
		applyTheme('system');
	}
});

const scheduleSync = () => requestAnimationFrame(() => requestAnimationFrame(syncFromStorage));
if (document.readyState === 'complete') {
	scheduleSync();
} else {
	window.addEventListener('load', scheduleSync);
}
